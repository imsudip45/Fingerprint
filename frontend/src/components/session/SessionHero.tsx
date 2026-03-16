import { Fingerprint as Logo, UserRound } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

interface SessionHeroProps {
  learnerName: string | null;
  heroTitle: string;
  mastery: number;
  onOpenProfile: () => void;
}

export function SessionHero({
  learnerName,
  heroTitle,
  mastery,
  onOpenProfile,
}: SessionHeroProps) {
  return (
    <header className="relative z-20 px-4 pt-4 sm:px-6 sm:pt-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white text-zinc-950 shadow-[0_8px_25px_rgba(255,255,255,0.12)]">
            <Logo size={16} strokeWidth={2.5} />
          </div>
          <div>
            <p className="text-[14px] font-semibold tracking-tight text-white/92">Fingerprint</p>
            <p className="text-[11px] text-white/38">
              {learnerName ? `Learner: ${learnerName}` : 'Live learning session'}
            </p>
          </div>
        </div>

        <button
          onClick={onOpenProfile}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.12] bg-white/[0.04] text-white/80 shadow-[0_8px_30px_rgba(0,0,0,0.25)] transition-colors hover:bg-white/[0.1] hover:text-white"
          aria-label="Open learner profile"
        >
          <UserRound size={16} />
        </button>
      </div>

      <div className="mt-8 flex flex-col items-center gap-3 sm:mt-10">
        <AnimatePresence mode="wait">
          {heroTitle ? (
            <motion.div
              key={heroTitle}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="flex max-w-[36rem] flex-col items-center gap-2 text-center"
            >
              <p className="font-display text-[20px] leading-[1.05] tracking-[-0.04em] text-white/92 sm:text-[28px]">
                {heroTitle}
              </p>
              {mastery > 0 && (
                <div className="flex items-center gap-2 rounded-full border border-white/[0.06] bg-white/[0.03] px-3 py-1.5">
                  <div className="h-1.5 w-20 overflow-hidden rounded-full bg-white/[0.06]">
                    <div
                      className="h-full rounded-full bg-[linear-gradient(90deg,rgba(168,85,247,0.8),rgba(34,211,238,0.85))]"
                      style={{ width: `${Math.max(10, mastery)}%` }}
                    />
                  </div>
                  <span className="text-[10px] uppercase tracking-[0.16em] text-white/45">{mastery}% mastery</span>
                </div>
              )}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </header>
  );
}

