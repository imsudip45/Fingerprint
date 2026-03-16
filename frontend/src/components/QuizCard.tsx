import { motion, AnimatePresence } from 'motion/react';
import React, { useState, useCallback, useEffect } from 'react';
import { Check, X, Lightbulb, Sparkles, Trophy, Flame } from 'lucide-react';
import { QuizItem, QuizScore } from '../types';

interface QuizCardProps {
  quiz: QuizItem;
  onAnswer: (quizId: string, answer: string, correct: boolean) => void;
  score?: QuizScore;
}

const optionLabels = ['A', 'B', 'C', 'D'];

// Mini confetti particle
const ConfettiParticle: React.FC<{ delay: number; color: string }> = ({ delay, color }) => (
  <motion.div
    initial={{ y: 0, x: 0, opacity: 1, scale: 1 }}
    animate={{
      y: -(60 + Math.random() * 80),
      x: (Math.random() - 0.5) * 120,
      opacity: 0,
      scale: 0,
      rotate: Math.random() * 720,
    }}
    transition={{ duration: 0.8 + Math.random() * 0.4, delay, ease: 'easeOut' }}
    className="absolute top-1/2 left-1/2 w-2 h-2 rounded-full pointer-events-none"
    style={{ backgroundColor: color }}
  />
);

const confettiColors = ['#34d399', '#60a5fa', '#fbbf24', '#f472b6', '#a78bfa', '#fb923c'];

export const QuizCard = ({ quiz, onAnswer, score }: QuizCardProps) => {
  const [selected, setSelected] = useState<string | null>(quiz.selectedAnswer ?? null);
  const [answered, setAnswered] = useState(quiz.answered ?? false);
  const [showHint, setShowHint] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const isCorrect = selected === quiz.correctAnswer;

  const handleSelect = useCallback((option: string) => {
    if (answered) return;
    setSelected(option);
    setAnswered(true);
    const correct = option === quiz.correctAnswer;
    if (correct) setShowConfetti(true);
    onAnswer(quiz.id, option, correct);
  }, [answered, quiz.id, quiz.correctAnswer, onAnswer]);

  // Auto-hide confetti
  useEffect(() => {
    if (showConfetti) {
      const t = setTimeout(() => setShowConfetti(false), 1500);
      return () => clearTimeout(t);
    }
  }, [showConfetti]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="glass-surface-elevated rounded-2xl overflow-hidden relative"
    >
      {/* Confetti burst on correct */}
      <AnimatePresence>
        {showConfetti && (
          <div className="absolute inset-0 z-50 pointer-events-none overflow-hidden">
            {Array.from({ length: 18 }).map((_, i) => (
              <ConfettiParticle
                key={i}
                delay={Math.random() * 0.15}
                color={confettiColors[i % confettiColors.length]}
              />
            ))}
          </div>
        )}
      </AnimatePresence>

      {/* Header bar with score */}
      <div className="px-4 py-2.5 border-b border-white/5 flex items-center gap-2">
        <Sparkles size={13} className="text-amber-400/70" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/25">
          Quick Check
        </span>
        {score && score.total > 0 && (
          <div className="ml-auto flex items-center gap-2.5">
            {score.streak >= 2 && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-orange-500/15"
              >
                <Flame size={10} className="text-orange-400" />
                <span className="text-[9px] font-bold text-orange-300">{score.streak}</span>
              </motion.div>
            )}
            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-white/[0.04]">
              <Trophy size={9} className="text-amber-400/60" />
              <span className="text-[9px] font-mono text-white/30">
                {score.correct}/{score.total}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="p-4 sm:p-5">
        {/* Question */}
        <p className="text-[15px] sm:text-[16px] text-white/90 font-semibold leading-relaxed mb-4">
          {quiz.question}
        </p>

        {/* Options grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {quiz.options.map((option, i) => {
            const isThis = selected === option;
            const isAnswer = option === quiz.correctAnswer;
            
            let optionClass = 'bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] hover:border-white/[0.1] text-white/60';
            
            if (answered) {
              if (isAnswer) {
                optionClass = 'bg-emerald-500/15 border border-emerald-500/25 text-emerald-300';
              } else if (isThis && !isAnswer) {
                optionClass = 'bg-red-500/10 border border-red-500/20 text-red-300/80';
              } else {
                optionClass = 'bg-white/[0.02] border border-white/[0.04] text-white/20';
              }
            }

            return (
              <motion.button
                key={i}
                onClick={() => handleSelect(option)}
                disabled={answered}
                whileHover={!answered ? { scale: 1.02 } : undefined}
                whileTap={!answered ? { scale: 0.98 } : undefined}
                className={`relative p-3 rounded-xl text-left transition-colors duration-200 ${optionClass} ${
                  answered ? 'cursor-default' : 'cursor-pointer'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <span className={`text-[11px] font-mono font-bold mt-0.5 flex-shrink-0 ${
                    answered && isAnswer ? 'text-emerald-400' : 
                    answered && isThis ? 'text-red-400' :
                    'text-white/25'
                  }`}>
                    {optionLabels[i]}
                  </span>
                  <span className="text-[13px] sm:text-[14px] leading-snug">{option}</span>
                </div>
                
                {/* Correct/Incorrect icon */}
                <AnimatePresence>
                  {answered && isAnswer && (
                    <motion.div
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="absolute top-2 right-2"
                    >
                      <Check size={14} className="text-emerald-400" />
                    </motion.div>
                  )}
                  {answered && isThis && !isAnswer && (
                    <motion.div
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="absolute top-2 right-2"
                    >
                      <X size={14} className="text-red-400" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.button>
            );
          })}
        </div>

        {/* Feedback section */}
        <AnimatePresence>
          {answered && (
            <motion.div
              initial={{ opacity: 0, height: 0, marginTop: 0 }}
              animate={{ opacity: 1, height: 'auto', marginTop: 12 }}
              transition={{ duration: 0.3 }}
              className="overflow-hidden"
            >
              {isCorrect ? (
                <motion.div
                  initial={{ scale: 0.95 }}
                  animate={{ scale: 1 }}
                  className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/15 rounded-lg px-3 py-2.5"
                >
                  <Sparkles size={14} className="text-emerald-400 flex-shrink-0" />
                  <span className="text-[13px] text-emerald-300 font-medium">
                    {score && score.streak >= 3 ? `🔥 ${score.streak} in a row! You're on fire!` :
                     score && score.streak === 2 ? 'Correct! Nice streak going!' :
                     'Correct! Amazing job!'}
                  </span>
                </motion.div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/15 rounded-lg px-3 py-2.5">
                    <Lightbulb size={14} className="text-amber-400 flex-shrink-0" />
                    <span className="text-[13px] text-amber-300/90">
                      The correct answer is <strong className="text-amber-200">{quiz.correctAnswer}</strong>
                    </span>
                  </div>
                  {quiz.hint && !showHint && (
                    <button
                      onClick={() => setShowHint(true)}
                      className="text-[11px] text-white/25 hover:text-white/50 transition-colors"
                    >
                      Show hint
                    </button>
                  )}
                  {showHint && quiz.hint && (
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-[12px] text-white/30 leading-relaxed pl-1"
                    >
                      {quiz.hint}
                    </motion.p>
                  )}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};
