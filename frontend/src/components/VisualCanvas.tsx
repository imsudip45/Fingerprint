import { motion, AnimatePresence } from 'motion/react';
import { useEffect, useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { VisualItem, QuizItem, ContentCard } from '../types';
import { QuizCard } from './QuizCard';

interface ContentCanvasProps {
  visuals: VisualItem[];
  quizzes: QuizItem[];
  isLoading: boolean;
  onQuizAnswer: (quizId: string, answer: string, correct: boolean) => void;
}

const ImageDisplay = ({ visual }: { visual: VisualItem }) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.97 }}
    animate={{ opacity: 1, scale: 1 }}
    className="w-full flex flex-col items-center"
  >
    <div className="rounded-2xl overflow-hidden w-full bg-black/30 border border-white/[0.06]">
      <img
        src={`data:${visual.mimeType || 'image/png'};base64,${visual.content}`}
        alt={visual.prompt || 'Educational illustration'}
        className="w-full object-contain max-h-[50vh]"
      />
    </div>
  </motion.div>
);

export const VisualCanvas = ({ visuals, quizzes, isLoading, onQuizAnswer }: ContentCanvasProps) => {
  // Merge visuals and quizzes into a single ordered content stream
  const cards: ContentCard[] = [
    ...visuals.map(v => ({ kind: 'image' as const, data: v })),
    ...quizzes.map(q => ({ kind: 'quiz' as const, data: q })),
  ].sort((a, b) => a.data.timestamp - b.data.timestamp);

  const [currentIndex, setCurrentIndex] = useState(cards.length - 1);

  useEffect(() => { setCurrentIndex(cards.length - 1); }, [cards.length]);

  const goNext = useCallback(() => setCurrentIndex(i => Math.min(i + 1, cards.length - 1)), [cards.length]);
  const goPrev = useCallback(() => setCurrentIndex(i => Math.max(i - 1, 0)), []);

  if (cards.length === 0 && !isLoading) return null;

  const currentCard = cards[currentIndex];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="w-full flex flex-col gap-3"
    >
      {/* Current content card */}
      <div className="relative">
        <AnimatePresence mode="wait">
          {currentCard ? (
            <motion.div
              key={currentCard.data.id}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.25 }}
            >
              {currentCard.kind === 'image' ? (
                <ImageDisplay visual={currentCard.data} />
              ) : currentCard.kind === 'quiz' ? (
                <QuizCard quiz={currentCard.data} onAnswer={onQuizAnswer} />
              ) : null}
            </motion.div>
          ) : isLoading ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="glass-surface rounded-2xl p-8 flex flex-col items-center justify-center gap-3"
            >
              <Loader2 size={20} className="text-white/20 animate-spin" />
              <span className="text-[11px] text-white/20">Generating illustration...</span>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* Navigation arrows — overlaid on the card */}
        {cards.length > 1 && (
          <>
            <button
              onClick={goPrev}
              disabled={currentIndex === 0}
              className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/50 backdrop-blur-sm text-white/40 hover:text-white/80 disabled:opacity-0 transition-all z-10"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={goNext}
              disabled={currentIndex === cards.length - 1}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/50 backdrop-blur-sm text-white/40 hover:text-white/80 disabled:opacity-0 transition-all z-10"
            >
              <ChevronRight size={16} />
            </button>
          </>
        )}
      </div>

      {/* Navigation dots + loading indicator */}
      {(cards.length > 1 || isLoading) && (
        <div className="flex items-center justify-center gap-1.5">
          {cards.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentIndex(i)}
              className={`rounded-full transition-all duration-300 ${
                i === currentIndex 
                  ? 'w-5 h-1.5 bg-white/40' 
                  : 'w-1.5 h-1.5 bg-white/10 hover:bg-white/20'
              }`}
            />
          ))}
          {isLoading && (
            <Loader2 size={10} className="text-white/20 animate-spin ml-1" />
          )}
        </div>
      )}
    </motion.div>
  );
};
