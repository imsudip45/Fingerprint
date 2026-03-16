import { AnimatePresence, motion } from 'motion/react';
import { X, UserRound, Brain, Sparkles, BookOpenCheck } from 'lucide-react';
import { LearnerProfile } from '../../types';

interface ProfilePanelProps {
  isOpen: boolean;
  profile: LearnerProfile | null;
  onClose: () => void;
}

const styleLabel = (style: string) => {
  const map: Record<string, string> = {
    storyteller: 'Storyteller',
    analogist: 'Analogist',
    visualizer: 'Visualizer',
    teacher: 'Teacher',
  };
  return map[style] || style;
};

export function ProfilePanel({ isOpen, profile, onClose }: ProfilePanelProps) {
  const masteryEntries = Object.entries(profile?.mastery || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50"
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

          <motion.aside
            initial={{ x: 24, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 24, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute right-3 top-3 h-[calc(100vh-1.5rem)] w-[min(28rem,calc(100vw-1.5rem))] rounded-[26px] border border-white/[0.08] bg-[rgba(10,12,20,0.9)] shadow-[0_18px_80px_rgba(0,0,0,0.45)]"
          >
            <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/[0.08]">
                  <UserRound size={14} className="text-white/80" />
                </div>
                <div>
                  <p className="text-[14px] font-semibold text-white/92">Learner Profile</p>
                  <p className="text-[11px] text-white/45">{profile?.learnerName || 'Loading...'}</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="rounded-full border border-white/[0.08] bg-white/[0.03] p-1.5 text-white/70 hover:text-white"
                aria-label="Close profile"
              >
                <X size={14} />
              </button>
            </div>

            <div className="h-[calc(100%-61px)] overflow-y-auto px-4 py-4 space-y-4">
              {!profile ? (
                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4 text-[13px] text-white/60">
                  Loading profile...
                </div>
              ) : (
                <>
                  <div className={`grid ${profile.styleConfidence > 0 ? 'grid-cols-3' : 'grid-cols-2'} gap-2`}>
                    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5">
                      <p className="text-[10px] uppercase tracking-wider text-white/35">Sessions</p>
                      <p className="mt-1 text-[16px] font-semibold text-white/92">{profile.sessionCount}</p>
                    </div>
                    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5">
                      <p className="text-[10px] uppercase tracking-wider text-white/35">Style</p>
                      <p className="mt-1 text-[13px] font-semibold text-white/92">{styleLabel(profile.learningStyle)}</p>
                    </div>
                    {profile.styleConfidence > 0 && (
                      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5">
                        <p className="text-[10px] uppercase tracking-wider text-white/35">Confidence</p>
                        <p className="mt-1 text-[16px] font-semibold text-white/92">{profile.styleConfidence}%</p>
                      </div>
                    )}
                  </div>

                  {profile.learningWays.length > 0 && (
                    <section className="rounded-2xl border border-cyan-300/10 bg-cyan-500/[0.06] p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Brain size={13} className="text-cyan-300" />
                        <p className="text-[12px] font-semibold text-white/88">Learning ways</p>
                      </div>
                      <div className="space-y-2">
                        {profile.learningWays.map((way) => (
                          <div key={way.style} className="flex items-center justify-between rounded-xl bg-white/[0.03] px-2.5 py-2">
                            <span className="text-[12px] text-white/78">{styleLabel(way.style)}</span>
                            <span className="text-[11px] text-white/52">{way.count} signals</span>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {masteryEntries.length > 0 && (
                    <section className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <BookOpenCheck size={13} className="text-white/70" />
                        <p className="text-[12px] font-semibold text-white/88">Mastery snapshot</p>
                      </div>
                      <div className="space-y-2">
                        {masteryEntries.map(([topic, score]) => (
                          <div key={topic} className="space-y-1">
                            <div className="flex items-center justify-between text-[11px] text-white/72">
                              <span className="truncate pr-2">{topic}</span>
                              <span>{Math.max(0, Math.min(100, Math.round(score)))}%</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                              <div className="h-full rounded-full bg-[linear-gradient(90deg,rgba(34,211,238,0.8),rgba(168,85,247,0.8))]" style={{ width: `${Math.max(4, Math.min(100, Math.round(score)))}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {profile.interests.length > 0 && (
                    <section className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Sparkles size={13} className="text-amber-300" />
                        <p className="text-[12px] font-semibold text-white/88">Recent interests</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {profile.interests.slice(-10).map((interest, idx) => (
                          <span
                            key={`${interest}-${idx}`}
                            className="rounded-full border border-white/[0.07] bg-white/[0.03] px-2.5 py-1 text-[11px] text-white/72"
                          >
                            {interest}
                          </span>
                        ))}
                      </div>
                    </section>
                  )}
                </>
              )}
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
