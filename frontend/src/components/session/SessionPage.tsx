import { AnimatePresence, motion } from 'motion/react';
import { AudioOrb3D } from '../AudioOrb3D';
import { Brain } from 'lucide-react';
import {
  AgentPlan,
  AppState,
  LessonStep,
  LearningStyle,
  QuizScore,
  SessionProgress,
  VisualItem,
  QuizItem,
  SearchResultItem,
  WorkedExampleItem,
  ArtifactAnalysisItem,
  LearnerProfile,
} from '../../types';
import { SessionHero } from './SessionHero';
import { SessionStage } from './SessionStage';
import { SessionConsole } from './SessionConsole';
import { useSessionViewModel } from './useSessionViewModel';
import { ProfilePanel } from './ProfilePanel';

interface SessionPageProps {
  learnerName: string | null;
  isConnected: boolean;
  appState: AppState;
  isMuted: boolean;
  statusMessage: string | null;
  learningStyle: LearningStyle | null;
  transcript: string;
  caption: string;
  isRescueMode: boolean;
  visuals: VisualItem[];
  quizzes: QuizItem[];
  searchResults: SearchResultItem[];
  workedExamples: WorkedExampleItem[];
  artifactAnalyses: ArtifactAnalysisItem[];
  isVisualLoading: boolean;
  agentAction: string | null;
  quizScore: QuizScore;
  connectionError: string | null;
  currentTopic: string | null;
  sessionProgress: SessionProgress | null;
  subtopics: string[];
  lessonPlan: LessonStep[];
  agentPlan: AgentPlan | null;
  inputAudioNode: AudioNode | null;
  outputAudioNode: AudioNode | null;
  onToggleConnection: () => void;
  onToggleMute: () => void;
  onQuizAnswer: (payload: any) => void;
  onReaction: (emoji: string) => void;
  onSubtopicClick: (subtopic: string) => void;
  onUploadVisual: (file: File) => void;
  onSendText: (text: string) => boolean;
  profile: LearnerProfile | null;
  isProfileOpen: boolean;
  onOpenProfile: () => void;
  onCloseProfile: () => void;
}

export function SessionPage({
  learnerName,
  isConnected,
  appState,
  isMuted,
  statusMessage,
  learningStyle,
  caption,
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
  subtopics,
  lessonPlan,
  agentPlan,
  inputAudioNode,
  outputAudioNode,
  onToggleConnection,
  onToggleMute,
  onQuizAnswer,
  onReaction,
  onSubtopicClick,
  onUploadVisual,
  onSendText,
  profile,
  isProfileOpen,
  onOpenProfile,
  onCloseProfile,
}: SessionPageProps) {
  const {
    captionText,
    captionVisible,
    compactStatus,
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
  } = useSessionViewModel({
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
  });

  return (
    <main className="relative w-full h-screen overflow-hidden bg-[#09090b]">
      <div className="absolute inset-0 pointer-events-none">
        <AudioOrb3D inputNode={inputAudioNode} outputNode={outputAudioNode} appState={appState} mood={orbMood} isMuted={isMuted} />
      </div>

      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,rgba(150,126,255,0.2),transparent_28%),radial-gradient(circle_at_70%_26%,rgba(0,210,255,0.12),transparent_24%),linear-gradient(180deg,rgba(4,6,12,0.1),rgba(4,6,12,0.38)_44%,rgba(4,6,12,0.68))] pointer-events-none" />

      <div className="relative z-10 flex h-full flex-col">
        <SessionHero
          learnerName={learnerName}
          heroTitle={heroTitle}
          mastery={mastery}
          onOpenProfile={onOpenProfile}
        />

        <AnimatePresence>
          {agentPlan && (
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.98 }}
              className="absolute left-4 top-20 z-40 w-[calc(100%-2rem)] md:w-80 pointer-events-none hidden md:block"
            >
              <div className="rounded-2xl border border-white/[0.1] bg-black/40 p-4 shadow-2xl backdrop-blur-md">
                <div className="flex items-center gap-2 mb-3">
                  <Brain size={14} className="text-purple-400" />
                  <span className="text-xs font-semibold text-white/80 uppercase tracking-widest">Agent Brain</span>
                </div>
                <div className="space-y-2 text-[11px]">
                  <div className="flex justify-between border-b border-white/5 pb-1">
                    <span className="text-white/40">State:</span>
                    <span className="text-white/80 font-medium capitalize">{agentPlan.learner_state}</span>
                  </div>
                  <div className="flex justify-between border-b border-white/5 pb-1">
                    <span className="text-white/40">Action:</span>
                    <span className="text-white/80 font-medium capitalize">{agentPlan.next_action.replace(/_/g, ' ')}</span>
                  </div>
                  <div className="space-y-1 pt-1">
                    <span className="text-white/40 block">Reasoning:</span>
                    <p className="text-white/70 leading-relaxed italic border-l-2 border-purple-500/30 pl-2">
                      "{agentPlan.reason}"
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="relative flex flex-1 flex-col overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
          <SessionStage
            showStage={showStage}
            stageEyebrow={stageEyebrow}
            stageTitle={stageTitle}
            stageSubtitle={stageSubtitle}
            compactStatus={compactStatus}
            nextMove={nextMove}
            phase={phase}
            mastery={mastery}
            showInlineSubtopics={showInlineSubtopics}
            subtopics={subtopics}
            currentTopic={currentTopic}
            agentPlan={agentPlan}
            sessionProgress={sessionProgress}
            visuals={visuals}
            quizzes={quizzes}
            searchResults={searchResults}
            workedExamples={workedExamples}
            artifactAnalyses={artifactAnalyses}
            isVisualLoading={isVisualLoading}
            quizScore={quizScore}
            onQuizAnswer={onQuizAnswer}
            onSubtopicClick={onSubtopicClick}
          />

          <AnimatePresence>
            {connectionError && (
              <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 14 }}
                className="pointer-events-none absolute left-1/2 top-4 z-30 -translate-x-1/2 px-4"
              >
                <div className="rounded-full border border-red-500/20 bg-red-950/60 px-4 py-2 text-[12px] text-red-200/90 shadow-[0_12px_40px_rgba(0,0,0,0.25)] backdrop-blur-xl">
                  {connectionError}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {captionVisible && captionText && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.4 }}
                className="pointer-events-none mx-auto mb-3 w-[min(52rem,calc(100vw-1.5rem))] px-3"
              >
                <div className="rounded-[26px] border border-white/[0.08] bg-[rgba(8,10,18,0.72)] px-5 py-3 shadow-[0_16px_60px_rgba(0,0,0,0.28)] backdrop-blur-xl">
                  <p className="text-center text-[14px] leading-[1.8] text-white/82 sm:text-[15px]">
                    {captionText}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <SessionConsole
            isConnected={isConnected}
            isMuted={isMuted}
            appState={appState}
            currentTopic={currentTopic}
            onToggleConnection={onToggleConnection}
            onToggleMute={onToggleMute}
            onReaction={onReaction}
            onUploadVisual={onUploadVisual}
            onSend={onSendText}
          />
        </div>
      </div>

      <ProfilePanel
        isOpen={isProfileOpen}
        profile={profile}
        onClose={onCloseProfile}
      />
    </main>
  );
}

