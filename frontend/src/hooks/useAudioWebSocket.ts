import { useState, useRef, useCallback, useEffect } from 'react';
import { AppState, LearningStyle, AgentEvent, AgentPlan, VisualItem, QuizItem, SearchResultItem, WorkedExampleItem, ArtifactAnalysisItem, QuizScore, SessionProgress, LessonStep, SessionSummary } from '../types';
import { LearnerIdentity } from '../lib/learnerIdentity';

export const useAudioWebSocket = (url: string, learnerIdentity: LearnerIdentity | null, onProfileUpdate?: (profile: any) => void) => {
  const [isConnected, setIsConnected] = useState(false);
  const [appState, setAppState] = useState<AppState>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [isDataIncoming, setIsDataIncoming] = useState(false);
  const [learningStyle, setLearningStyle] = useState<LearningStyle>('storyteller');
  const [transcript, setTranscript] = useState('');
  const [agentEvents, setAgentEvents] = useState<AgentEvent[]>([]);
  const [isRescueMode, setIsRescueMode] = useState(false);
  const [visuals, setVisuals] = useState<VisualItem[]>([]);
  const [quizzes, setQuizzes] = useState<QuizItem[]>([]);
  const [isVisualLoading, setIsVisualLoading] = useState(false);
  const [agentAction, setAgentAction] = useState<string | undefined>();
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [workedExamples, setWorkedExamples] = useState<WorkedExampleItem[]>([]);
  const [artifactAnalyses, setArtifactAnalyses] = useState<ArtifactAnalysisItem[]>([]);
  const [quizScore, setQuizScore] = useState<QuizScore>({ correct: 0, total: 0, streak: 0, bestStreak: 0 });
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [currentTopic, setCurrentTopic] = useState<string | null>(null);
  const [sessionProgress, setSessionProgress] = useState<SessionProgress | null>(null);
  const [caption, setCaption] = useState('');
  const [subtopics, setSubtopics] = useState<string[]>([]);
  const [lessonPlan, setLessonPlan] = useState<LessonStep[]>([]);
  const [sessionSummary, setSessionSummary] = useState<SessionSummary | null>(null);
  const [agentPlan, setAgentPlan] = useState<AgentPlan | null>(null);
  const learnerIdRef = useRef<string>(learnerIdentity?.learnerId || '');
  const learnerNameRef = useRef<string>(learnerIdentity?.learnerName || '');
  const sessionStartRef = useRef<number>(0);

  const [inputAudioNode, setInputAudioNode] = useState<AudioNode | null>(null);
  const [outputAudioNode, setOutputAudioNode] = useState<AudioNode | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const playbackCtxRef = useRef<AudioContext | null>(null);
  const micCtxRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<AudioNode | null>(null);
  const nextPlayTimeRef = useRef(0);
  const speakingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const outputGainRef = useRef<GainNode | null>(null);
  const outputFilterRef = useRef<BiquadFilterNode | null>(null);
  const outputCompressorRef = useRef<DynamicsCompressorNode | null>(null);
  const inputGainRef = useRef<GainNode | null>(null);
  // Use a ref for isMuted so callbacks don't need to be recreated
  const isMutedRef = useRef(false);
  const autoMutedForSpeakingRef = useRef(false);
  const prevAppStateRef = useRef<AppState>('idle');

  // Caption timing alignment: buffer captions and release them on the audio clock.
  const captionQueueRef = useRef<Array<{ text: string; showAt: number }>>([]);
  const captionFlushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Local turn index (incremented on each turn_complete) so we can auto-hide
  // older visual/quiz content after the tutor finishes explaining it.
  const turnIndexRef = useRef(0);

  const resetAudioGraph = useCallback(() => {
    // Stop anything still scheduled to play
    activeSourcesRef.current.forEach(src => {
      try { src.stop(); } catch { /* ignore */ }
    });
    activeSourcesRef.current = [];
    nextPlayTimeRef.current = 0;

    // Clear graph nodes (they belong to a specific AudioContext)
    outputGainRef.current = null;
    outputFilterRef.current = null;
    outputCompressorRef.current = null;
    inputGainRef.current = null;
    setInputAudioNode(null);
    setOutputAudioNode(null);

    // Clear caption buffer so old text can't appear later
    captionQueueRef.current = [];
  }, []);

  // Barge-in (interruption) detection refs
  const appStateRef = useRef<AppState>('idle');
  const bargeInStartRef = useRef<number | null>(null);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const BARGE_IN_THRESHOLD = 0.012; // More sensitive threshold so normal speech can interrupt reliably.
  const BARGE_IN_DURATION_MS = 280; // Trigger faster so interruption feels immediate.
  const MAX_AGENT_EVENTS = 100;

  /** Shared barge-in detection — called from both AudioWorklet and ScriptProcessor paths. */
  const checkBargeIn = useCallback((rms: number) => {
    if (appStateRef.current === 'speaking' && rms > BARGE_IN_THRESHOLD) {
      if (!bargeInStartRef.current) {
        bargeInStartRef.current = Date.now();
      } else if (Date.now() - bargeInStartRef.current >= BARGE_IN_DURATION_MS) {
        activeSourcesRef.current.forEach(src => {
          try { src.stop(); } catch (_) { /* already stopped */ }
        });
        activeSourcesRef.current = [];
        nextPlayTimeRef.current = 0;
        if (speakingTimeoutRef.current) {
          clearTimeout(speakingTimeoutRef.current);
          speakingTimeoutRef.current = null;
        }
        setAppState('listening');
        bargeInStartRef.current = null;

        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
          socketRef.current.send(JSON.stringify({ type: 'interrupt' }));
        }
      }
    } else {
      bargeInStartRef.current = null;
    }
  }, []);

  // Keep refs in sync with state
  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    appStateRef.current = appState;

    const wasSpeaking = prevAppStateRef.current === 'speaking';
    const isSpeakingNow = appState === 'speaking';

    if (wasSpeaking && !isSpeakingNow) {
      // Audio has actually finished playing
      setCaption('');
    }

    // The mic now stays open continuously during the 'speaking' state to allow for true barge-in (interruption).
    // The Gemini Live API natively supports bidirectional audio and handles interruption when it hears the user speak.

    prevAppStateRef.current = appState;
  }, [appState]);

  const enqueueCaption = useCallback((text: string) => {
    const chunk = String(text || '');
    if (!chunk) return;

    const nowMs = Date.now();
    const ctx = playbackCtxRef.current;
    let delayMs = 450; // sensible default

    if (ctx && ctx.state !== 'closed') {
      const queuedMs = Math.max(0, (nextPlayTimeRef.current - ctx.currentTime) * 1000);
      // If a lot of audio is already queued, captions should be delayed more.
      delayMs = Math.min(1400, Math.max(220, queuedMs));
    }

    captionQueueRef.current.push({ text: chunk, showAt: nowMs + delayMs });
  }, []);

  // Flush queued captions on a timer so they roughly sync with scheduled playback.
  useEffect(() => {
    if (captionFlushTimerRef.current) return;
    captionFlushTimerRef.current = setInterval(() => {
      const now = Date.now();
      const queue = captionQueueRef.current;
      if (!queue.length) return;

      let didAppend = false;
      while (queue.length && queue[0].showAt <= now) {
        const item = queue.shift();
        if (!item?.text) continue;
        didAppend = true;
        setCaption(prev => prev + item.text);
      }
      if (!didAppend) return;
    }, 50);

    return () => {
      if (captionFlushTimerRef.current) {
        clearInterval(captionFlushTimerRef.current);
        captionFlushTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    learnerIdRef.current = learnerIdentity?.learnerId || '';
    learnerNameRef.current = learnerIdentity?.learnerName || '';
  }, [learnerIdentity]);

  const initPlaybackAudio = useCallback(async () => {
    if (!playbackCtxRef.current) {
      playbackCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 24000,
      });
    }
    if (playbackCtxRef.current.state === 'suspended') {
      await playbackCtxRef.current.resume();
    }
    // Create output gain node for 3D visualizer
    if (!outputGainRef.current && playbackCtxRef.current) {
      const gain = playbackCtxRef.current.createGain();

      const lowpass = playbackCtxRef.current.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 7200;
      lowpass.Q.value = 0.7;

      const compressor = playbackCtxRef.current.createDynamicsCompressor();
      compressor.threshold.value = -20;
      compressor.knee.value = 20;
      compressor.ratio.value = 3;
      compressor.attack.value = 0.004;
      compressor.release.value = 0.18;

      gain.gain.value = 0.86;
      gain.connect(lowpass);
      lowpass.connect(compressor);
      compressor.connect(playbackCtxRef.current.destination);

      outputGainRef.current = gain;
      outputFilterRef.current = lowpass;
      outputCompressorRef.current = compressor;
      setOutputAudioNode(gain);
    }
  }, []);

  // Gap-free scheduled playback
  const scheduleAudioChunk = useCallback((float32Data: Float32Array) => {
    const ctx = playbackCtxRef.current;
    if (!ctx) return;

    const audioBuffer = ctx.createBuffer(1, float32Data.length, 24000);
    audioBuffer.getChannelData(0).set(float32Data);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(outputGainRef.current || ctx.destination);

    const now = ctx.currentTime;
    const startTime = Math.max(now, nextPlayTimeRef.current);
    source.start(startTime);
    nextPlayTimeRef.current = startTime + audioBuffer.duration;

    // Track active sources for barge-in flushing
    activeSourcesRef.current.push(source);
    source.onended = () => {
      activeSourcesRef.current = activeSourcesRef.current.filter(s => s !== source);
    };

    setAppState('speaking');

    if (speakingTimeoutRef.current) clearTimeout(speakingTimeoutRef.current);
    const remainingMs = (nextPlayTimeRef.current - now) * 1000;
    speakingTimeoutRef.current = setTimeout(() => {
      setAppState('listening');
    }, remainingMs + 100);
  }, []);

  const downsampleBuffer = (buffer: Float32Array, inputSampleRate: number, outputSampleRate: number): Int16Array => {
    if (inputSampleRate === outputSampleRate) {
      const result = new Int16Array(buffer.length);
      for (let i = 0; i < buffer.length; i++) {
        result[i] = Math.max(-1, Math.min(1, buffer[i])) * 32767;
      }
      return result;
    }
    const ratio = inputSampleRate / outputSampleRate;
    const newLength = Math.round(buffer.length / ratio);
    const result = new Int16Array(newLength);
    for (let i = 0; i < newLength; i++) {
      const srcIndex = i * ratio;
      const srcIndexFloor = Math.floor(srcIndex);
      const srcIndexCeil = Math.min(srcIndexFloor + 1, buffer.length - 1);
      const frac = srcIndex - srcIndexFloor;
      const sample = buffer[srcIndexFloor] * (1 - frac) + buffer[srcIndexCeil] * frac;
      result[i] = Math.max(-1, Math.min(1, sample)) * 32767;
    }
    return result;
  };

  const connect = useCallback(() => {
    if (
      socketRef.current?.readyState === WebSocket.OPEN ||
      socketRef.current?.readyState === WebSocket.CONNECTING
    ) {
      return;
    }

    if (!learnerIdRef.current) {
      setConnectionError('Choose a learner profile before starting.');
      return;
    }

    const wsUrl = new URL(url, window.location.href);
    wsUrl.searchParams.set('learner_id', learnerIdRef.current);
    if (learnerNameRef.current) {
      wsUrl.searchParams.set('learner_name', learnerNameRef.current);
    }
    const socket = new WebSocket(wsUrl.toString());
    socket.binaryType = 'arraybuffer';

    socket.onopen = () => {
      setIsConnected(true);
      setStatusMessage('Connected — Waiting for greeting');
      setAgentEvents([]);
      setTranscript('');
      setIsRescueMode(false);
      setVisuals([]);
      setQuizzes([]);
      setIsVisualLoading(false);
      setAgentAction(undefined);
      setSearchResults([]);
      setWorkedExamples([]);
      setArtifactAnalyses([]);
      setQuizScore({ correct: 0, total: 0, streak: 0, bestStreak: 0 });
      setConnectionError(null);
      setCurrentTopic(null);
      setSessionProgress(null);
      setCaption('');
      captionQueueRef.current = [];
      setSubtopics([]);
      setLessonPlan([]);
      setSessionSummary(null);
      setAgentPlan(null);
      sessionStartRef.current = Date.now();
      turnIndexRef.current = 0;
    };

    socket.onclose = () => {
      setIsConnected(false);
      setAppState('idle');
      setStatusMessage('Disconnected');
      if (playbackCtxRef.current) {
        playbackCtxRef.current.close();
        playbackCtxRef.current = null;
      }
      resetAudioGraph();
      // Build session summary from local state for the end screen
      setSessionSummary(prev => {
        // Only build if we had a real session
        if (!sessionStartRef.current) return prev;
        return null; // Will be built in App.tsx from accumulated state
      });
    };

    socket.onmessage = async (event) => {
      if (typeof event.data === 'string') {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'status') setStatusMessage(msg.data);
          if (msg.type === 'state') setAppState(msg.data);
          if (msg.type === 'style') {
            setLearningStyle(msg.data as LearningStyle);
            setIsRescueMode(false);
            setAgentEvents(prev => [...prev, {
              timestamp: Date.now(),
              type: 'fingerprint',
              message: `🧬 Fingerprint: ${msg.data} style detected`,
              style: msg.data as LearningStyle,
            }].slice(-MAX_AGENT_EVENTS));
          }
          if (msg.type === 'rescue') {
            setIsRescueMode(true);
            setAgentEvents(prev => [...prev, {
              timestamp: Date.now(),
              type: 'rescue',
              message: 'Rescue mode active - simplifying and adapting',
            }].slice(-MAX_AGENT_EVENTS));
          }
          if (msg.type === 'agent_plan') {
            setAgentPlan(msg.data || null);
            setIsRescueMode(!!msg.data?.rescue);
            setAgentEvents(prev => [...prev, {
              timestamp: Date.now(),
              type: 'plan',
              message: `Plan: ${msg.data?.focus || 'next step'} -> ${msg.data?.next_action || 'explain'}`,
            }].slice(-MAX_AGENT_EVENTS));
          }
          if (msg.type === 'detection') {
            setAgentEvents(prev => [...prev, {
              timestamp: Date.now(),
              type: 'detection',
              message: msg.data,
            }].slice(-MAX_AGENT_EVENTS));
          }
          if (msg.type === 'transcript') {
            setTranscript(prev => prev + msg.data);
          }
          if (msg.type === 'caption') {
            enqueueCaption(msg.data);
          }
          if (msg.type === 'turn_complete') {
            turnIndexRef.current += 1;
            setTranscript(prev => prev + '\n\n');
            const currentTurn = turnIndexRef.current;
            const maxAge = 2;
            // Auto-hide older content a couple of turns after it was introduced
            setVisuals(prev =>
              prev.filter(v => v.createdTurn == null || currentTurn - v.createdTurn < maxAge),
            );
            setWorkedExamples(prev =>
              prev.filter(w => w.createdTurn == null || currentTurn - w.createdTurn < maxAge),
            );
            setSearchResults(prev =>
              prev.filter(s => s.createdTurn == null || currentTurn - s.createdTurn < maxAge),
            );
            setArtifactAnalyses(prev =>
              prev.filter(a => a.createdTurn == null || currentTurn - a.createdTurn < maxAge),
            );
          }
          if (msg.type === 'visual') {
            const v = msg.data;
            const newVisual: VisualItem = {
              id: `visual-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              kind: 'image',
              content: v.content,
              mimeType: v.mime_type,
              prompt: v.prompt,
              title: v.title,
              source: v.source || 'agent',
              timestamp: Date.now(),
              createdTurn: turnIndexRef.current,
            };
            setVisuals(prev => [...prev, newVisual].slice(-20));
            setAgentEvents(prev => [...prev, {
              timestamp: Date.now(),
              type: 'detection',
              message: (v.source || 'agent') === 'learner' ? 'Worksheet or image uploaded' : 'Illustration generated',
            }].slice(-MAX_AGENT_EVENTS));
          }
          if (msg.type === 'quiz') {
            const q = msg.data;
            const newQuiz: QuizItem = {
              id: `quiz-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              question: q.question,
              type: q.type || 'multiple_choice',
              options: q.options,
              correctAnswer: q.correctAnswer,
              hint: q.hint || '',
              timestamp: Date.now(),
              createdTurn: turnIndexRef.current,
            };
            setQuizzes(prev => [...prev, newQuiz].slice(-20));
            setAgentEvents(prev => [...prev, {
              timestamp: Date.now(),
              type: 'detection',
              message: 'Quiz question ready',
            }].slice(-MAX_AGENT_EVENTS));
          }
          if (msg.type === 'visual_loading') {
            setIsVisualLoading(msg.data);
          }
          if (msg.type === 'agent_action') {
            setAgentAction(msg.data ?? undefined);
          }
          if (msg.type === 'error') {
            setConnectionError(msg.data || 'Connection error');
            setStatusMessage(msg.data || 'Connection error');
          }
          if (msg.type === 'topic') {
            setCurrentTopic(msg.data);
            setAgentEvents(prev => [...prev, {
              timestamp: Date.now(),
              type: 'detection',
              message: `Topic: ${msg.data}`,
            }].slice(-MAX_AGENT_EVENTS));
          }
          if (msg.type === 'progress') {
            setSessionProgress(msg.data);
            if (msg.data?.currentPlan) setAgentPlan(msg.data.currentPlan);
            if (typeof msg.data?.rescueMode === 'boolean') setIsRescueMode(msg.data.rescueMode);
          }
          if (msg.type === 'subtopics') {
            setSubtopics(msg.data || []);
          }
          if (msg.type === 'lesson_plan') {
            setLessonPlan(msg.data || []);
          }
          if (msg.type === 'search_result') {
            const s = msg.data;
            const newResult: SearchResultItem = {
              id: `search-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              title: s.title,
              query: s.query,
              facts: s.facts,
              sources: s.sources || [],
              timestamp: Date.now(),
              createdTurn: turnIndexRef.current,
            };
            setSearchResults(prev => [...prev, newResult].slice(-20));
          }
          if (msg.type === 'worked_example') {
            const w = msg.data;
            const newExample: WorkedExampleItem = {
              id: `example-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              title: w.title || 'Worked Example',
              steps: w.steps || [],
              answer: w.answer || '',
              practice: w.practice || '',
              timestamp: Date.now(),
              createdTurn: turnIndexRef.current,
            };
            setWorkedExamples(prev => [...prev, newExample].slice(-20));
            setAgentEvents(prev => [...prev, {
              timestamp: Date.now(),
              type: 'detection',
              message: `Step-by-step: ${w.title || 'solution'}`,
            }].slice(-MAX_AGENT_EVENTS));
          }
          if (msg.type === 'profile_update') {
            if (onProfileUpdate) onProfileUpdate(msg.data);
          }
          if (msg.type === 'session_summary') {
            setSessionSummary(msg.data || null);
          }
          if (msg.type === 'artifact_analysis') {
            const a = msg.data;
            const newAnalysis: ArtifactAnalysisItem = {
              id: `analysis-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              label: a.label || 'Learner upload',
              artifactType: a.artifact_type || 'other',
              summary: a.summary || '',
              detectedTopic: a.detected_topic || '',
              reasoningFocus: a.reasoning_focus || '',
              extractedProblem: a.extracted_problem || '',
              needsClarification: !!a.needs_clarification,
              suggestedNextStep: a.suggested_next_step || 'explain',
              coachPrompt: a.coach_prompt || '',
              timestamp: Date.now(),
              createdTurn: turnIndexRef.current,
            };
            setArtifactAnalyses(prev => [...prev, newAnalysis].slice(-20));
            setAgentEvents(prev => [...prev, {
              timestamp: Date.now(),
              type: 'detection',
              message: `Visual analysis: ${newAnalysis.reasoningFocus || newAnalysis.detectedTopic || newAnalysis.label}`,
            }].slice(-MAX_AGENT_EVENTS));
          }
        } catch (e) {
          console.error('Parse error', e);
        }
      } else if (event.data instanceof ArrayBuffer) {
        setIsDataIncoming(true);
        setTimeout(() => setIsDataIncoming(false), 150);

        await initPlaybackAudio();

        const int16Data = new Int16Array(event.data);
        const float32Data = new Float32Array(int16Data.length);
        for (let i = 0; i < int16Data.length; i++) {
          float32Data[i] = int16Data[i] / 32768.0;
        }
        scheduleAudioChunk(float32Data);
      }
    };

    socketRef.current = socket;
  }, [url, scheduleAudioChunk, initPlaybackAudio, enqueueCaption, resetAudioGraph]);

  const disconnect = useCallback(() => {
    socketRef.current?.close();
    socketRef.current = null;
    processorRef.current?.disconnect();
    mediaStreamRef.current?.getTracks().forEach(track => track.stop());
    if (micCtxRef.current) {
      micCtxRef.current.close();
      micCtxRef.current = null;
    }
    if (playbackCtxRef.current) {
      playbackCtxRef.current.close();
      playbackCtxRef.current = null;
    }
    resetAudioGraph();
    setAppState('idle');
  }, [resetAudioGraph]);

  // Start Microphone — uses isMutedRef so this callback is STABLE (no deps on isMuted)
  const startMic = useCallback(async () => {
    // Don't re-init if already running
    if (processorRef.current) return;

    try {
      await initPlaybackAudio();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, sampleRate: { ideal: 16000 } }
      });
      mediaStreamRef.current = stream;

      micCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      const micSampleRate = micCtxRef.current.sampleRate;

      const source = micCtxRef.current.createMediaStreamSource(stream);

      // Create input gain node for 3D visualizer
      const inputGain = micCtxRef.current.createGain();
      source.connect(inputGain);
      inputGainRef.current = inputGain;
      setInputAudioNode(inputGain);

      if (micCtxRef.current.audioWorklet && typeof AudioWorkletNode !== 'undefined') {
        // Modern path: use AudioWorkletNode to avoid ScriptProcessorNode deprecation.
        await micCtxRef.current.audioWorklet.addModule(new URL('../audio/mic-processor.js', import.meta.url).href);
        const worklet = new AudioWorkletNode(micCtxRef.current, 'mic-processor', {
          numberOfInputs: 1,
          numberOfOutputs: 0,
          channelCount: 1,
        });

        worklet.port.onmessage = (event) => {
          const inputData = event.data as Float32Array;
          if (isMutedRef.current || !socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return;

          let sumSquares = 0;
          for (let i = 0; i < inputData.length; i++) {
            sumSquares += inputData[i] * inputData[i];
          }
          const rms = Math.sqrt(sumSquares / inputData.length);

          checkBargeIn(rms);

          const int16Data = downsampleBuffer(inputData, micSampleRate, 16000);
          socketRef.current.send(int16Data.buffer);
          if (appStateRef.current !== 'speaking') {
            setAppState('listening');
          }
        };

        source.connect(worklet);
        processorRef.current = worklet;
      } else {
        // Fallback for older browsers: ScriptProcessorNode (deprecated but widely supported).
        const processor = micCtxRef.current.createScriptProcessor(4096, 1, 1);
        processor.onaudioprocess = (e) => {
          if (isMutedRef.current || !socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return;
          const inputData = e.inputBuffer.getChannelData(0);

          let sumSquares = 0;
          for (let i = 0; i < inputData.length; i++) {
            sumSquares += inputData[i] * inputData[i];
          }
          const rms = Math.sqrt(sumSquares / inputData.length);

          checkBargeIn(rms);

          const int16Data = downsampleBuffer(inputData, micSampleRate, 16000);
          socketRef.current.send(int16Data.buffer);
          if (appStateRef.current !== 'speaking') {
            setAppState('listening');
          }
        };
        source.connect(processor);
        processor.connect(micCtxRef.current.destination);
        processorRef.current = processor;
      }
    } catch (err) {
      console.error('Mic error', err);
    }
  }, [initPlaybackAudio]); // NO isMuted dependency!

  const stopMic = useCallback(() => {
    processorRef.current?.disconnect();
    processorRef.current = null;
    mediaStreamRef.current?.getTracks().forEach(track => track.stop());
    mediaStreamRef.current = null;
    if (micCtxRef.current) {
      micCtxRef.current.close();
      micCtxRef.current = null;
    }
    setAppState('idle');
  }, []);

  // Cleanup on unmount (handles Vite HMR & React StrictMode)
  useEffect(() => {
    return () => {
      socketRef.current?.close();
      socketRef.current = null;
      processorRef.current?.disconnect();
      processorRef.current = null;
      mediaStreamRef.current?.getTracks().forEach(track => track.stop());
      if (micCtxRef.current) {
        micCtxRef.current.close();
        micCtxRef.current = null;
      }
      if (playbackCtxRef.current) {
        playbackCtxRef.current.close();
        playbackCtxRef.current = null;
      }
      resetAudioGraph();
    };
  }, [resetAudioGraph]);

  const toggleMute = useCallback(() => {
    autoMutedForSpeakingRef.current = false;
    setIsMuted(prev => {
      const next = !prev;
      isMutedRef.current = next;
      return next;
    });
  }, []);

  const sendQuizAnswer = useCallback((quizId: string, answer: string, correct: boolean) => {
    // Update local quiz state
    setQuizzes(prev => prev.map(q => 
      q.id === quizId ? { ...q, answered: true, selectedAnswer: answer } : q
    ));
    // Update score
    setQuizScore(prev => {
      const newStreak = correct ? prev.streak + 1 : 0;
      return {
        correct: prev.correct + (correct ? 1 : 0),
        total: prev.total + 1,
        streak: newStreak,
        bestStreak: Math.max(prev.bestStreak, newStreak),
      };
    });
    // Send to backend
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'quiz_answer',
        data: { quizId, answer, correct }
      }));
    }
    // After a short delay (allowing the agent to react and explain),
    // remove this quiz card from the stream so the stage can move on.
    setTimeout(() => {
      setQuizzes(prev => prev.filter(q => q.id !== quizId));
    }, 3000);
  }, []);

  const sendReaction = useCallback((emoji: string) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'reaction', data: emoji }));
    }
  }, []);

  const sendTextMessage = useCallback((text: string) => {
    const cleaned = text.trim();
    if (!cleaned || !socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return false;

    socketRef.current.send(JSON.stringify({
      type: 'text_input',
      data: cleaned,
    }));
    setAppState('thinking');
    setStatusMessage('Responding to your message');
    setAgentEvents(prev => [...prev, {
      timestamp: Date.now(),
      type: 'info',
      message: `You typed: ${cleaned.slice(0, 80)}`,
    }].slice(-MAX_AGENT_EVENTS));
    return true;
  }, []);

  const sendSubtopicClick = useCallback((subtopic: string) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'subtopic_click', data: subtopic }));
    }
  }, []);

  const uploadVisual = useCallback(async (file: File) => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return;
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('Failed to read image'));
      reader.readAsDataURL(file);
    });
    const match = dataUrl.match(/^data:(.+);base64,(.+)$/);
    if (!match) return;
    const [, mimeType, base64Data] = match;
    socketRef.current.send(JSON.stringify({
      type: 'visual_input',
      data: {
        label: file.name || 'Learner upload',
        mime_type: mimeType,
        data: base64Data,
      },
    }));
  }, []);

  return {
    isConnected,
    appState,
    isMuted,
    statusMessage,
    isDataIncoming,
    learningStyle,
    transcript,
    caption,
    agentEvents,
    isRescueMode,
    visuals,
    quizzes,
    isVisualLoading,
    agentAction,
    searchResults,
    workedExamples,
    artifactAnalyses,
    quizScore,
    connectionError,
    currentTopic,
    sessionProgress,
    sessionSummary,
    subtopics,
    lessonPlan,
    sessionStartTime: sessionStartRef.current,
    learnerId: learnerIdRef.current,
    learnerName: learnerNameRef.current,
    agentPlan,
    inputAudioNode,
    outputAudioNode,
    connect,
    disconnect,
    toggleMute,
    startMic,
    stopMic,
    sendQuizAnswer,
    sendReaction,
    sendTextMessage,
    sendSubtopicClick,
    uploadVisual,
  };
};
