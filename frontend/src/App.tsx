import { AnimatePresence, motion } from 'motion/react';
import { useState, useEffect, useRef } from 'react';
import { SessionSummary } from './components/SessionSummary';
import { LoginLandingPage } from './components/LoginLandingPage';
import { AudioOrb3D } from './components/AudioOrb3D';
import { SessionPage } from './components/session/SessionPage';
import { useAudioWebSocket } from './hooks/useAudioWebSocket';
import { LearnerIdentity, clearSavedLearnerIdentity, loadSavedLearnerIdentity, saveLearnerIdentity } from './lib/learnerIdentity';
import { LearnerProfile } from './types';

export default function App() {
  const [savedIdentity, setSavedIdentity] = useState<LearnerIdentity | null>(() => loadSavedLearnerIdentity());
  const [learnerIdentity, setLearnerIdentity] = useState<LearnerIdentity | null>(null);
  const [authView, setAuthView] = useState<'saved' | 'create'>(() => (loadSavedLearnerIdentity() ? 'saved' : 'create'));
  const [isPreparingLearner, setIsPreparingLearner] = useState(false);
  const [learnerProfile, setLearnerProfile] = useState<LearnerProfile | null>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [summaryData, setSummaryData] = useState<{
    topic: string;
    mastery: number;
    duration: number;
    subtopics: { id: string; title: string; complete: boolean }[];
  } | null>(null);
  const {
    isConnected,
    appState,
    isMuted,
    statusMessage,
    learningStyle,
    transcript,
    caption,
    agentEvents,
    isRescueMode,
    visuals,
    quizzes,
    searchResults,
    workedExamples,
    artifactAnalyses,
    isVisualLoading,
    agentAction,
    quizScore,
    connectionError,
    currentTopic,
    sessionProgress,
    sessionSummary,
    subtopics,
    lessonPlan,
    learnerId,
    learnerName,
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
  } = useAudioWebSocket(
    import.meta.env.DEV
      ? 'ws://localhost:8000/ws/chat'
      : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/chat`,
    learnerIdentity,
      (newProfile) => setLearnerProfile(newProfile as LearnerProfile)
  );
  (window as any).agentPlan = agentPlan;
  const wasConnectedRef = useRef(false);
  const sessionStartRef = useRef(0);

  useEffect(() => {
    if (!savedIdentity && authView === 'saved') {
      setAuthView('create');
    }
  }, [savedIdentity, authView]);

  const loadLearnerProfile = async (learnerId: string) => {
    if (!learnerId) return;
    const baseUrl = import.meta.env.DEV ? 'http://localhost:8000' : window.location.origin;
    const response = await fetch(`${baseUrl}/api/profile/${encodeURIComponent(learnerId)}`);
    if (!response.ok) {
      throw new Error('Failed to load learner profile');
    }
    const payload = await response.json();
    setLearnerProfile(payload as LearnerProfile);
  };

  useEffect(() => {
    if (!learnerIdentity?.learnerId) {
      setLearnerProfile(null);
      return;
    }
    loadLearnerProfile(learnerIdentity.learnerId).catch(() => {
      setLearnerProfile(null);
    });
  }, [learnerIdentity?.learnerId]);

  // Track session start and build summary on disconnect
  useEffect(() => {
    if (isConnected) {
      wasConnectedRef.current = true;
      sessionStartRef.current = Date.now();
      setShowSummary(false);
      setSummaryData(null);
    } else if (wasConnectedRef.current) {
      if (sessionSummary) {
        setSummaryData(sessionSummary);
        setShowSummary(true);
      } else {
        const duration = Math.floor((Date.now() - sessionStartRef.current) / 1000);
        if (duration > 5) {
          setSummaryData({
            topic: currentTopic,
            mastery: sessionProgress?.mastery ?? 0,
            duration,
            subtopics: sessionProgress?.subtopics ?? [],
          });
          setShowSummary(true);
        }
      }
    }
  }, [isConnected, sessionSummary, currentTopic, sessionProgress]);

  const handleToggleConnection = () => {
    if (isConnected) {
      stopMic();
      disconnect();
    } else {
      if (!learnerIdentity) return;
      connect();
      setTimeout(() => startMic(), 500);
    }
  };

  const handleLearnerAuth = async (name: string, pin: string, mode: 'signin' | 'create') => {
    setIsPreparingLearner(true);
    try {
      const baseUrl = import.meta.env.DEV ? 'http://localhost:8000' : window.location.origin;
      const response = await fetch(`${baseUrl}/api/auth/${mode === 'signin' ? 'login' : 'create'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          learner_name: name,
          pin,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.detail || 'Unable to continue.');
      }
      const identity: LearnerIdentity = {
        learnerId: String(payload.learnerId || ''),
        learnerName: String(payload.learnerName || name),
      };
      if (!identity.learnerId) {
        throw new Error('Learner account response was incomplete.');
      }
      saveLearnerIdentity(identity);
      setSavedIdentity(identity);
      setLearnerIdentity(identity);
      setAuthView('saved');
    } finally {
      setIsPreparingLearner(false);
    }
  };

  const handleContinueSaved = () => {
    if (!savedIdentity) return;
    setLearnerIdentity(savedIdentity);
  };

  const handleForgetLearner = () => {
    if (isConnected) return;
    clearSavedLearnerIdentity();
    setSavedIdentity(null);
    setLearnerIdentity(null);
    setAuthView('create');
  };

  const handleSwitchLearner = () => {
    if (isConnected) return;
    setLearnerIdentity(null);
    setLearnerProfile(null);
    setIsProfileOpen(false);
    setAuthView(savedIdentity ? 'saved' : 'create');
  };

  const handleOpenProfile = () => {
    if (!learnerIdentity?.learnerId) return;
    setIsProfileOpen(true);
    loadLearnerProfile(learnerIdentity.learnerId).catch(() => {
      // Keep current state if refresh fails.
    });
  };

  const handleStartSession = () => {
    if (!learnerIdentity) return;
    connect();
    setTimeout(() => startMic(), 500);
  };

  const landingMode = learnerIdentity ? 'ready' : authView;

  if (!isConnected && !showSummary) {
    return (
      <main className="relative w-full h-screen overflow-hidden bg-[#09090b]">
        <div className="absolute inset-0 pointer-events-none">
          <AudioOrb3D inputNode={null} outputNode={null} appState="idle" mood="idle" isMuted={true} />
        </div>
        <LoginLandingPage
          mode={landingMode}
          savedIdentity={savedIdentity}
          activeIdentity={learnerIdentity}
          isBusy={isPreparingLearner}
          onContinueSaved={handleContinueSaved}
          onSubmitLearnerAuth={handleLearnerAuth}
          onOpenCreate={() => setAuthView('create')}
          onBackToSaved={() => setAuthView('saved')}
          onForgetSaved={handleForgetLearner}
          onStartSession={handleStartSession}
          onSwitchLearner={handleSwitchLearner}
        />
      </main>
    );
  }

  return (
    <>
      <SessionPage
        learnerName={learnerIdentity?.learnerName || null}
        isConnected={isConnected}
        appState={appState}
        isMuted={isMuted}
        statusMessage={statusMessage}
        learningStyle={learningStyle}
        transcript={transcript}
        caption={caption}
        isRescueMode={isRescueMode}
        visuals={visuals}
        quizzes={quizzes}
        searchResults={searchResults}
        workedExamples={workedExamples}
        artifactAnalyses={artifactAnalyses}
        isVisualLoading={isVisualLoading}
        agentAction={agentAction}
        quizScore={quizScore}
        connectionError={connectionError}
        currentTopic={currentTopic}
        sessionProgress={sessionProgress}
        subtopics={subtopics}
        lessonPlan={lessonPlan}
        agentPlan={agentPlan}
        inputAudioNode={inputAudioNode}
        outputAudioNode={outputAudioNode}
        onToggleConnection={handleToggleConnection}
        onToggleMute={toggleMute}
        onQuizAnswer={sendQuizAnswer}
        onReaction={sendReaction}
        onSubtopicClick={sendSubtopicClick}
        onUploadVisual={uploadVisual}
        onSendText={sendTextMessage}
        profile={learnerProfile}
        isProfileOpen={isProfileOpen}
        onOpenProfile={handleOpenProfile}
        onCloseProfile={() => setIsProfileOpen(false)}
      />

      <AnimatePresence>
        {showSummary && summaryData && (
          <SessionSummary
            topic={summaryData.topic}
            quizScore={quizScore}
            learningStyle={learningStyle}
            duration={summaryData.duration}
            subtopics={summaryData.subtopics}
            mastery={summaryData.mastery}
            onNewSession={() => {
              setShowSummary(false);
              setSummaryData(null);
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}
