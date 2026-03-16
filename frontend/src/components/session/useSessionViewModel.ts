import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AgentPlan,
  AppState,
  ArtifactAnalysisItem,
  QuizItem,
  SearchResultItem,
  SessionProgress,
  VisualItem,
  WorkedExampleItem,
} from '../../types';

type StageKind = 'empty' | 'image' | 'quiz' | 'search' | 'worked_example' | 'artifact_analysis';

interface SessionViewModelArgs {
  appState: AppState;
  statusMessage: string | null;
  isRescueMode: boolean;
  agentAction: string | null;
  currentTopic: string | null;
  sessionProgress: SessionProgress | null;
  subtopics: string[];
  agentPlan: AgentPlan | null;
  caption: string;
  visuals: VisualItem[];
  quizzes: QuizItem[];
  searchResults: SearchResultItem[];
  workedExamples: WorkedExampleItem[];
  artifactAnalyses: ArtifactAnalysisItem[];
  isVisualLoading: boolean;
}

const stageLabels: Record<StageKind, string> = {
  empty: 'Teaching Stage',
  image: 'Visual Stage',
  quiz: 'Quick Check',
  search: 'Fact Board',
  worked_example: 'Worked Example',
  artifact_analysis: 'Visual Grounding',
};

export function useSessionViewModel({
  appState,
  statusMessage,
  isRescueMode,
  agentAction,
  currentTopic,
  sessionProgress,
  subtopics,
  agentPlan,
  caption,
  visuals,
  quizzes,
  searchResults,
  workedExamples,
  artifactAnalyses,
  isVisualLoading,
}: SessionViewModelArgs) {
  const [captionVisible, setCaptionVisible] = useState(false);
  const captionTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const timeline = useMemo(
    () =>
      [
        ...visuals.map((item) => ({ kind: 'image' as const, timestamp: item.timestamp })),
        ...quizzes.map((item) => ({ kind: 'quiz' as const, timestamp: item.timestamp })),
        ...searchResults.map((item) => ({ kind: 'search' as const, timestamp: item.timestamp })),
        ...workedExamples.map((item) => ({ kind: 'worked_example' as const, timestamp: item.timestamp })),
        ...artifactAnalyses.map((item) => ({ kind: 'artifact_analysis' as const, timestamp: item.timestamp })),
      ].sort((a, b) => b.timestamp - a.timestamp),
    [artifactAnalyses, quizzes, searchResults, visuals, workedExamples],
  );

  const activeStageKind: StageKind = timeline[0]?.kind ?? 'empty';
  const hasContent = timeline.length > 0;
  const showStage = isVisualLoading || hasContent;
  const compactStatus = agentAction ? agentAction.replace(/_/g, ' ') : statusMessage || 'live session';
  const orbMood = isRescueMode ? 'rescue' : agentAction ? `action:${agentAction}` : appState;
  const stageEyebrow = stageLabels[activeStageKind];
  const stageTitle =
    currentTopic ||
    agentPlan?.focus ||
    (activeStageKind === 'empty' ? 'Choose where Fingerprint should begin' : 'Adaptive lesson in progress');
  const stageSubtitle =
    agentPlan?.goal ||
    (currentTopic
      ? `Fingerprint is shaping the next move around ${currentTopic.toLowerCase()}.`
      : 'Talk, type, or upload work to start the lesson flow.');
  const nextMove =
    agentPlan?.next_action?.replace(/_/g, ' ') ||
    (appState === 'thinking' ? 'thinking through the next step' : 'waiting for learner input');
  const showInlineSubtopics = subtopics.length > 0 && !!currentTopic && !hasContent;
  const mastery = sessionProgress?.mastery ?? 0;
  const phase = sessionProgress?.phase || agentPlan?.learner_state || 'discovering';
  const heroTitle = currentTopic || (hasContent || isVisualLoading ? stageTitle : '');

  useEffect(() => {
    if (!caption.trim()) {
      setCaptionVisible(false);
      return;
    }
    setCaptionVisible(true);
    if (captionTimeoutRef.current) clearTimeout(captionTimeoutRef.current);
    captionTimeoutRef.current = setTimeout(() => setCaptionVisible(false), 10000);
  }, [caption]);

  const captionText = useMemo(() => {
    const clean = caption.trim().replace(/\n+/g, ' ').trim();
    if (!clean) return '';
    if (clean.length <= 280) return clean;
    const tail = clean.slice(-280);
    const sentenceBreak = tail.search(/[.!?]\s/);
    if (sentenceBreak >= 0 && sentenceBreak < 90) {
      return tail.slice(sentenceBreak + 2).trim();
    }
    const wordBreak = tail.indexOf(' ');
    return wordBreak >= 0 ? tail.slice(wordBreak + 1).trim() : tail;
  }, [caption]);

  return {
    activeStageKind,
    captionText,
    captionVisible,
    compactStatus,
    hasContent,
    heroTitle,
    mastery,
    nextMove,
    orbMood,
    phase,
    showInlineSubtopics,
    showStage,
    stageEyebrow,
    stageSubtitle,
    stageTitle,
    visuals,
    quizzes,
    searchResults,
    workedExamples,
    artifactAnalyses,
    isVisualLoading,
  };
}

