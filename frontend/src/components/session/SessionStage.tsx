import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, Compass, Sparkles } from 'lucide-react';
import { AgentPlan, ArtifactAnalysisItem, QuizItem, QuizScore, SearchResultItem, SessionProgress, VisualItem, WorkedExampleItem } from '../../types';
import { ContentStream } from '../ContentStream';

interface SessionStageProps {
  showStage: boolean;
  stageEyebrow: string;
  stageTitle: string;
  stageSubtitle: string;
  compactStatus: string;
  nextMove: string;
  phase: string;
  mastery: number;
  showInlineSubtopics: boolean;
  subtopics: string[];
  currentTopic: string | null;
  agentPlan: AgentPlan | null;
  sessionProgress: SessionProgress | null;
  visuals: VisualItem[];
  quizzes: QuizItem[];
  searchResults: SearchResultItem[];
  workedExamples: WorkedExampleItem[];
  artifactAnalyses: ArtifactAnalysisItem[];
  isVisualLoading: boolean;
  quizScore: QuizScore;
  onQuizAnswer: (quizId: string, answer: string, correct: boolean) => void;
  onSubtopicClick: (subtopic: string) => void;
}

export function SessionStage({
  showStage,
  stageEyebrow,
  stageTitle,
  stageSubtitle,
  compactStatus,
  nextMove,
  phase,
  mastery,
  showInlineSubtopics,
  subtopics,
  currentTopic,
  agentPlan,
  sessionProgress,
  visuals,
  quizzes,
  searchResults,
  workedExamples,
  artifactAnalyses,
  isVisualLoading,
  quizScore,
  onQuizAnswer,
  onSubtopicClick,
}: SessionStageProps) {
  const hasContent =
    visuals.length > 0 ||
    quizzes.length > 0 ||
    searchResults.length > 0 ||
    workedExamples.length > 0 ||
    artifactAnalyses.length > 0;

  return (
    <AnimatePresence>
      {showStage && (
        <motion.section
          initial={{ opacity: 0, y: 24, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.985 }}
          transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
          className="relative z-20 mx-auto mt-auto w-full max-w-[54rem] px-3 pb-3 sm:pb-5"
        >
          <div className="relative overflow-hidden rounded-[34px] border border-white/[0.12] bg-[linear-gradient(180deg,rgba(24,28,42,0.84),rgba(10,12,20,0.9))] p-4 shadow-[0_34px_120px_rgba(0,0,0,0.56),inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-[34px] sm:p-5">
            <div className="pointer-events-none absolute inset-0 rounded-[34px] border border-white/[0.04]" />
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.38),transparent)]" />
            <div className="pointer-events-none absolute left-[10%] right-[10%] top-0 h-24 rounded-full bg-white/[0.08] blur-3xl" />
            <div className="pointer-events-none absolute -right-12 top-12 h-36 w-36 rounded-full bg-cyan-300/[0.10] blur-3xl" />
            <div className="pointer-events-none absolute -left-12 bottom-8 h-40 w-40 rounded-full bg-violet-300/[0.10] blur-3xl" />

            <div className="relative flex flex-col gap-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-white/32">
                    <Sparkles size={11} className="text-cyan-300/70" />
                    <span>{stageEyebrow}</span>
                  </div>
                  <div>
                    <h2 className="text-[24px] font-semibold tracking-[-0.03em] text-white/94 sm:text-[28px]">
                      {stageTitle}
                    </h2>
                    <p className="mt-2 max-w-[38rem] text-[14px] leading-6 text-white/56 sm:text-[15px] sm:leading-7">
                      {stageSubtitle}
                    </p>
                  </div>
                </div>
              </div>

              {hasContent || isVisualLoading ? (
                <ContentStream
                  visuals={visuals}
                  quizzes={quizzes}
                  searchResults={searchResults}
                  workedExamples={workedExamples}
                  artifactAnalyses={artifactAnalyses}
                  isLoading={isVisualLoading}
                  onQuizAnswer={onQuizAnswer}
                  quizScore={quizScore}
                />
              ) : (
                <div className="rounded-[26px] border border-white/[0.08] bg-[rgba(7,10,18,0.56)] px-4 py-4 sm:px-5 sm:py-5">
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-white/26">
                    <Compass size={11} className="text-white/38" />
                    <span>Lesson ready</span>
                  </div>
                  <p className="mt-3 text-[15px] leading-7 text-white/78">
                    Fingerprint is waiting for a voice prompt, typed message, or uploaded worksheet to turn this into a guided lesson.
                  </p>
                </div>
              )}

              {showInlineSubtopics && (
                <div className="space-y-2 pt-1">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-white/24">Explore subtopics</p>
                  <div className="flex flex-wrap gap-2">
                    {subtopics.map((subtopic) => (
                      <button
                        key={subtopic}
                        type="button"
                        onClick={() => onSubtopicClick(subtopic)}
                        className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[12px] text-white/70 transition-colors hover:bg-white/[0.07] hover:text-white"
                      >
                        {subtopic}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}

