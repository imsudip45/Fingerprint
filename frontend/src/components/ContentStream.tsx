import { motion, AnimatePresence } from 'motion/react';
import { useEffect, useState, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Search, ExternalLink, Globe, BookOpen, Sparkles, Camera, ScanSearch, Layers3 } from 'lucide-react';
import { VisualItem, QuizItem, SearchResultItem, WorkedExampleItem, ArtifactAnalysisItem, ContentCard, QuizScore } from '../types';
import { QuizCard } from './QuizCard';
import { WorkedExampleCard } from './WorkedExampleCard';

interface ContentStreamProps {
  visuals: VisualItem[];
  quizzes: QuizItem[];
  searchResults: SearchResultItem[];
  workedExamples: WorkedExampleItem[];
  artifactAnalyses: ArtifactAnalysisItem[];
  isLoading: boolean;
  onQuizAnswer: (quizId: string, answer: string, correct: boolean) => void;
  quizScore?: QuizScore;
}

const ImageCard = ({ visual }: { visual: VisualItem }) => (
  
  <div className="rounded-[28px] overflow-hidden bg-[rgba(11,14,22,0.88)] border border-white/[0.08] shadow-[0_18px_60px_rgba(0,0,0,0.28)]">
    <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-2.5">
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${visual.source === 'learner' ? 'bg-cyan-500/10' : 'bg-violet-500/10'}`}>
        {visual.source === 'learner' ? (
          <Camera size={13} className="text-cyan-400" />
        ) : (
          <Sparkles size={13} className="text-violet-400" />
        )}
      </div>
      <div className="min-w-0">
        <p className="text-[14px] font-semibold text-white/92 truncate">{visual.title || (visual.source === 'learner' ? 'Learner upload' : 'Generated illustration')}</p>
        <p className="text-[12px] text-white/42">{visual.source === 'learner' ? 'Grounding artifact' : 'Teaching aid'}</p>
      </div>
    </div>
    <img
      src={visual.content.startsWith('data:image/') ? visual.content : `data:${visual.mimeType || 'image/png'};base64,${visual.content}`}
      alt={visual.prompt || 'Educational illustration'}
      className="w-full object-contain max-h-[45vh]"
    />
    {visual.prompt && (
      <div className="px-4 py-3 border-t border-white/[0.06]">
        <p className="text-[14px] text-white/80 leading-relaxed line-clamp-2">{visual.prompt}</p>
      </div>
    )}
  </div>
);

const AnalysisCard = ({ analysis }: { analysis: ArtifactAnalysisItem }) => (
  <div className="rounded-[28px] overflow-hidden border border-emerald-300/10 bg-[linear-gradient(180deg,rgba(16,34,26,0.92),rgba(10,20,18,0.94))] shadow-[0_18px_60px_rgba(0,0,0,0.26)]">
    <div className="px-4 py-3 border-b border-white/[0.04] flex items-center gap-2.5">
      <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center">
        <ScanSearch size={13} className="text-emerald-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[14px] sm:text-[15px] font-semibold text-white/90 truncate">{analysis.label}</p>
          <p className="text-[12px] text-white/42 truncate">{analysis.artifactType.replace(/_/g, ' ')}</p>
      </div>
    </div>
    <div className="px-4 py-3 space-y-3">
      <p className="text-[13px] sm:text-[14px] text-white/78 leading-[1.7]">{analysis.summary}</p>
      {(analysis.reasoningFocus || analysis.detectedTopic) && (
        <div className="rounded-2xl bg-white/[0.03] border border-white/[0.05] px-3 py-2.5">
          <p className="text-[10px] text-white/25 uppercase tracking-wider">Teaching focus</p>
          <p className="text-[13px] text-white/75 mt-1">{analysis.reasoningFocus || analysis.detectedTopic}</p>
        </div>
      )}
      {analysis.extractedProblem && (
        <div className="rounded-2xl bg-white/[0.03] border border-white/[0.05] px-3 py-2.5">
          <p className="text-[10px] text-white/25 uppercase tracking-wider">Problem spotted</p>
          <p className="text-[13px] text-white/75 mt-1 leading-[1.6]">{analysis.extractedProblem}</p>
        </div>
      )}
      <div className="flex items-center justify-between gap-3 text-[11px] text-white/45">
        <span>Next move: {analysis.suggestedNextStep}</span>
        <span>{analysis.needsClarification ? 'Needs clarification' : 'Ready to teach'}</span>
      </div>
    </div>
  </div>
);

const SearchCard = ({ result }: { result: SearchResultItem }) => {
  // Parse facts into bullet points (split on newlines or numbered items)
  const factLines = result.facts
    .split(/\n+/)
    .map(l => l.replace(/^\d+[\.\)]\s*/, '').replace(/^[\-\*]\s*/, '').replace(/\*\*/g, '').trim())
    .filter(l => l.length > 5);

  return (
    <div className="rounded-[28px] overflow-hidden border border-white/[0.08] bg-[rgba(11,14,22,0.88)] shadow-[0_18px_60px_rgba(0,0,0,0.28)]">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/[0.04] flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center">
          <Search size={13} className="text-blue-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] sm:text-[15px] font-semibold text-white/90 truncate">{result.title}</p>
          <p className="text-[12px] text-white/42 truncate">{result.query}</p>
        </div>
        <Globe size={12} className="text-white/15 flex-shrink-0" />
      </div>

      {/* Facts */}
      <div className="px-4 py-3 space-y-2.5">
        {factLines.slice(0, 4).map((fact, i) => (
          <div key={i} className="flex items-start gap-2.5">
            <Sparkles size={10} className="text-amber-400/60 mt-1 flex-shrink-0" />
            <p className="text-[13px] sm:text-[14px] text-white/75 leading-[1.7]">{fact}</p>
          </div>
        ))}
      </div>

      {/* Sources */}
      {result.sources.length > 0 && (
        <div className="px-4 py-2.5 border-t border-white/[0.04] flex flex-wrap gap-2">
          {result.sources.slice(0, 3).map((src, i) => {
            let domain = '';
            try { domain = new URL(src.url).hostname.replace('www.', ''); } catch { domain = 'source'; }
            return (
              <a
                key={i}
                href={src.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.04] hover:bg-white/[0.08] transition-colors group"
              >
                <ExternalLink size={9} className="text-white/20 group-hover:text-white/40" />
                <span className="text-[10px] sm:text-[11px] text-white/30 group-hover:text-white/50 truncate max-w-[120px]">
                  {domain}
                </span>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
};

const kindLabel: Record<ContentCard['kind'], string> = {
  image: 'Visual',
  quiz: 'Quiz',
  search: 'Facts',
  worked_example: 'Worked example',
  artifact_analysis: 'Analysis',
};

export const ContentStream = ({ visuals, quizzes, searchResults, workedExamples, artifactAnalyses, isLoading, onQuizAnswer, quizScore }: ContentStreamProps) => {
  const cards: ContentCard[] = [
    ...visuals.map(v => ({ kind: 'image' as const, data: v })),
    ...quizzes.map(q => ({ kind: 'quiz' as const, data: q })),
    ...searchResults.map(s => ({ kind: 'search' as const, data: s })),
    ...workedExamples.map(w => ({ kind: 'worked_example' as const, data: w })),
    ...artifactAnalyses.map(a => ({ kind: 'artifact_analysis' as const, data: a })),
  ].sort((a, b) => b.data.timestamp - a.data.timestamp);

  const [currentIndex, setCurrentIndex] = useState(0);
  useEffect(() => { setCurrentIndex(0); }, [cards.length]);

  const goNext = useCallback(() => setCurrentIndex(i => Math.min(i + 1, cards.length - 1)), [cards.length]);
  const goPrev = useCallback(() => setCurrentIndex(i => Math.max(i - 1, 0)), []);

  if (cards.length === 0 && !isLoading) return null;

  const currentCard = cards[currentIndex];

  return (
    <div className="w-full flex flex-col gap-3 max-h-full">
      {cards.length > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[11px] text-white/46">
            <Layers3 size={12} />
            <span>Recent</span>
          </div>
          {cards.map((card, i) => (
            <button
              key={card.data.id}
              onClick={() => setCurrentIndex(i)}
              className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] transition-colors ${
                i === currentIndex
                  ? 'border-white/[0.16] bg-white/[0.09] text-white'
                  : 'border-white/[0.06] bg-white/[0.03] text-white/55 hover:bg-white/[0.06] hover:text-white/84'
              }`}
            >
              <span>{kindLabel[card.kind]}</span>
            </button>
          ))}
        </div>
      )}

      <div className="relative">
        <AnimatePresence mode="wait">
          {currentCard ? (
            <motion.div
              key={currentCard.data.id}
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.98 }}
              transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            >
              {currentCard.kind === 'image' ? (
                <ImageCard visual={currentCard.data} />
              ) : currentCard.kind === 'quiz' ? (
                <QuizCard quiz={currentCard.data} onAnswer={onQuizAnswer} score={quizScore} />
              ) : currentCard.kind === 'artifact_analysis' ? (
                <AnalysisCard analysis={currentCard.data as ArtifactAnalysisItem} />
              ) : currentCard.kind === 'worked_example' ? (
                <WorkedExampleCard example={currentCard.data as WorkedExampleItem} />
              ) : (
                <SearchCard result={currentCard.data as SearchResultItem} />
              )}
            </motion.div>
          ) : isLoading ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="rounded-[28px] border border-white/[0.08] bg-[rgba(11,14,22,0.88)] p-8 flex flex-col items-center justify-center gap-3 shadow-[0_18px_60px_rgba(0,0,0,0.26)]"
            >
              <Loader2 size={18} className="text-white/15 animate-spin" />
              <span className="text-[11px] text-white/20">Generating...</span>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* Nav arrows */}
        {cards.length > 1 && (
          <>
            <button
              onClick={goPrev}
              disabled={currentIndex === 0}
              className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-[rgba(3,6,12,0.72)] backdrop-blur-sm text-white/45 hover:text-white/88 disabled:opacity-0 transition-all z-10"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              onClick={goNext}
              disabled={currentIndex === cards.length - 1}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-[rgba(3,6,12,0.72)] backdrop-blur-sm text-white/45 hover:text-white/88 disabled:opacity-0 transition-all z-10"
            >
              <ChevronRight size={14} />
            </button>
          </>
        )}
      </div>

      {/* Dots + loading */}
      {(cards.length > 1 || isLoading) && (
        <div className="flex items-center justify-center gap-2">
          {cards.map((card, i) => (
            <button
              key={i}
              onClick={() => setCurrentIndex(i)}
              className={`rounded-full transition-all duration-300 ${
                i === currentIndex
                  ? `w-6 h-1.5 ${
                      card.kind === 'search'
                        ? 'bg-blue-400/60'
                        : card.kind === 'quiz'
                          ? 'bg-amber-400/60'
                          : card.kind === 'artifact_analysis'
                            ? 'bg-emerald-400/60'
                            : 'bg-white/40'
                    }`
                  : 'w-1.5 h-1.5 bg-white/12 hover:bg-white/24'
              }`}
            />
          ))}
          {isLoading && (
            <Loader2 size={10} className="text-white/20 animate-spin ml-1" />
          )}
        </div>
      )}
    </div>
  );
};
