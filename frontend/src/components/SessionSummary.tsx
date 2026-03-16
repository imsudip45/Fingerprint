import { motion } from 'motion/react';
import { ArrowRight } from 'lucide-react';
import { QuizScore, LearningStyle } from '../types';

interface SessionSummaryProps {
  topic: string | null;
  quizScore: QuizScore;
  learningStyle: LearningStyle;
  duration: number;
  subtopics: string[];
  mastery: number;
  onNewSession: () => void;
}

const formatDuration = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  if (m < 1) return '<1 min';
  return `${m} min`;
};

const styleLabelMap: Record<string, string> = {
  storyteller: 'Storyteller',
  analogist: 'Analogist',
  visualizer: 'Visualizer',
  teacher: 'Teacher',
};

export const SessionSummary = ({ topic, quizScore, learningStyle, duration, subtopics, mastery, onNewSession }: SessionSummaryProps) => {
  const accuracy = quizScore.total > 0 ? Math.round((quizScore.correct / quizScore.total) * 100) : 0;
  const hasQuiz = quizScore.total > 0;

  // Build stat items — only show non-trivial data
  const stats: { value: string; label: string }[] = [
    { value: formatDuration(duration), label: 'Session' },
    { value: `${mastery}%`, label: 'Mastery' },
  ];
  if (hasQuiz) {
    stats.push({ value: `${quizScore.correct}/${quizScore.total}`, label: `Quiz · ${accuracy}%` });
  }
  if (subtopics.length > 0) {
    stats.push({ value: `${subtopics.length}`, label: 'Topics' });
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-2xl"
    >
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.05 }}
        className="w-full max-w-[400px] mx-4"
      >
        {/* Title block */}
        <div className="text-center mb-8">
          <p className="text-[11px] font-medium uppercase tracking-[0.15em] text-white/25 mb-3">
            Session complete
          </p>
          {topic ? (
            <h2 className="text-[24px] sm:text-[28px] font-semibold text-white tracking-[-0.02em] leading-tight">
              {topic}
            </h2>
          ) : (
            <h2 className="text-[24px] sm:text-[28px] font-semibold text-white tracking-[-0.02em]">
              Nice work!
            </h2>
          )}
        </div>

        {/* Stats row — horizontal, clean dividers */}
        <div className="flex items-center justify-center gap-0 mb-8">
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.06 }}
              className="flex items-center"
            >
              {i > 0 && <div className="w-px h-8 bg-white/[0.08] mx-5 sm:mx-6" />}
              <div className="text-center">
                <p className="text-[22px] sm:text-[24px] font-semibold text-white/90 leading-none tabular-nums">
                  {stat.value}
                </p>
                <p className="text-[10px] text-white/30 mt-1.5 font-medium tracking-wide">
                  {stat.label}
                </p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Learning style — single line */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.35 }}
          className="text-center mb-8"
        >
          <p className="text-[13px] text-white/35">
            Learning style:{' '}
            <span className="text-white/60 font-medium">
              {styleLabelMap[learningStyle] || learningStyle}
            </span>
          </p>
        </motion.div>

        {/* Subtopics — tight inline list */}
        {subtopics.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="flex flex-wrap justify-center gap-x-2 gap-y-1.5 mb-8"
          >
            {subtopics.slice(0, 6).map((s, i) => (
              <span
                key={i}
                className="text-[11px] text-white/25 px-2.5 py-1 rounded-full border border-white/[0.06]"
              >
                {s}
              </span>
            ))}
          </motion.div>
        )}

        {/* Action */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
          className="flex justify-center"
        >
          <button
            onClick={onNewSession}
            className="h-11 px-8 rounded-full bg-white text-zinc-900 font-medium text-[13px] flex items-center gap-2 hover:bg-white/90 transition-colors"
          >
            New session
            <ArrowRight size={14} />
          </button>
        </motion.div>
      </motion.div>
    </motion.div>
  );
};
