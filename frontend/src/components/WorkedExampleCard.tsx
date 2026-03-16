import { motion, AnimatePresence } from 'motion/react';
import { useState, useEffect } from 'react';
import { Calculator, ChevronRight, Lightbulb } from 'lucide-react';
import { WorkedExampleItem } from '../types';

interface WorkedExampleCardProps {
  example: WorkedExampleItem;
}

export const WorkedExampleCard = ({ example }: WorkedExampleCardProps) => {
  const [visibleSteps, setVisibleSteps] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [showPractice, setShowPractice] = useState(false);

  // Progressive reveal: steps appear one by one, then answer, then practice
  useEffect(() => {
    setVisibleSteps(0);
    setShowAnswer(false);
    setShowPractice(false);

    const totalSteps = example.steps.length;
    const timers: ReturnType<typeof setTimeout>[] = [];

    for (let i = 0; i < totalSteps; i++) {
      timers.push(setTimeout(() => setVisibleSteps(i + 1), (i + 1) * 1200));
    }
    timers.push(setTimeout(() => setShowAnswer(true), (totalSteps + 1) * 1200));
    timers.push(setTimeout(() => setShowPractice(true), (totalSteps + 2) * 1200));

    return () => timers.forEach(clearTimeout);
  }, [example.id]);

  // Detect math expressions like `x + 5 = 10` and wrap in mono font
  const renderMath = (text: string) => {
    const parts = text.split(/(`[^`]+`)/g);
    return parts.map((part, i) =>
      part.startsWith('`') && part.endsWith('`') ? (
        <code key={i} className="font-mono text-indigo-300 bg-indigo-500/10 px-1.5 py-0.5 rounded text-[13px]">
          {part.slice(1, -1)}
        </code>
      ) : (
        <span key={i}>{part}</span>
      )
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="glass-surface-elevated rounded-2xl overflow-hidden max-h-[70vh] overflow-y-auto scrollbar-thin"
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2.5 sticky top-0 bg-black/30 backdrop-blur-xl z-10">
        <div className="w-7 h-7 rounded-lg bg-indigo-500/15 flex items-center justify-center">
          <Calculator size={14} className="text-indigo-400" />
        </div>
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/30">
          Step by Step
        </span>
      </div>

      <div className="p-4 sm:p-5 space-y-4">
        {/* Title */}
        <p className="text-[15px] sm:text-[16px] text-white/90 font-semibold leading-snug">
          {example.title}
        </p>

        {/* Steps — progressively revealed */}
        <div className="space-y-3">
          <AnimatePresence>
            {example.steps.slice(0, visibleSteps).map((step, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 12, filter: 'blur(4px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
                className="flex items-start gap-3"
              >
                <div className="w-6 h-6 rounded-full bg-indigo-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-[11px] font-bold font-mono text-indigo-300">{i + 1}</span>
                </div>
                <p className="text-[13px] sm:text-[14px] text-white/70 leading-[1.75]">
                  {renderMath(step)}
                </p>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Loading indicator for next step */}
          {visibleSteps < example.steps.length && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-3 pl-1"
            >
              <div className="flex gap-1">
                {[0, 1, 2].map(i => (
                  <motion.div
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-indigo-400/40"
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                  />
                ))}
              </div>
              <span className="text-[11px] text-white/25">Working...</span>
            </motion.div>
          )}
        </div>

        {/* Answer */}
        <AnimatePresence>
          {showAnswer && example.answer && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.4 }}
              className="flex items-center gap-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3"
            >
              <ChevronRight size={14} className="text-emerald-400 flex-shrink-0" />
              <span className="text-[14px] sm:text-[15px] text-emerald-300 font-semibold font-mono">
                {example.answer}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Practice problem */}
        <AnimatePresence>
          {showPractice && example.practice && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.4 }}
              className="flex items-start gap-2.5 bg-amber-500/8 border border-amber-500/15 rounded-xl px-4 py-3"
            >
              <Lightbulb size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-amber-400/70 mb-1">
                  Your turn!
                </p>
                <p className="text-[13px] sm:text-[14px] text-amber-200/80 leading-relaxed font-medium">
                  {example.practice}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};
