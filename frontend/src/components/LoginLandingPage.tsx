import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, Fingerprint, LogOut, Plus, ShieldCheck, UserRound } from 'lucide-react';
import { LearnerIdentity } from '../lib/learnerIdentity';

export type LandingMode = 'saved' | 'create' | 'ready';

interface LoginLandingPageProps {
  mode: LandingMode;
  savedIdentity: LearnerIdentity | null;
  activeIdentity: LearnerIdentity | null;
  isBusy?: boolean;
  onContinueSaved: () => void;
  onSubmitLearnerAuth: (name: string, pin: string, mode: 'signin' | 'create') => Promise<void>;
  onOpenCreate: () => void;
  onBackToSaved: () => void;
  onForgetSaved: () => void;
  onStartSession: () => void;
  onSwitchLearner: () => void;
}

function PrimaryButton({
  children,
  onClick,
  type = 'button',
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
}) {
  return (
    <motion.button
      type={type}
      onClick={onClick}
      disabled={disabled}
      whileHover={disabled ? undefined : { y: -1, scale: 1.008 }}
      whileTap={disabled ? undefined : { scale: 0.985 }}
      className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[linear-gradient(180deg,#ffffff,#eceff6)] px-5 text-[14px] font-semibold text-black shadow-[0_10px_30px_rgba(255,255,255,0.08)] transition-all hover:shadow-[0_16px_40px_rgba(255,255,255,0.12)] disabled:cursor-not-allowed disabled:bg-white/[0.08] disabled:text-white/28 disabled:shadow-none"
    >
      <span className="inline-flex items-center gap-2 text-black">{children}</span>
    </motion.button>
  );
}

function SecondaryButton({
  children,
  onClick,
  subtle = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  subtle?: boolean;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.985 }}
      className={
        subtle
          ? 'w-full text-[12px] text-white/50 transition-colors hover:text-white/82'
          : 'inline-flex h-12 w-full items-center justify-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-5 text-[14px] font-medium text-white/82 transition-colors hover:bg-white/[0.07]'
      }
    >
      {children}
    </motion.button>
  );
}

function LearnerPreview({
  name,
  meta,
}: {
  name: string;
  meta: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-[24px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.02))] p-4"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.06] text-white/82">
          <UserRound size={18} />
        </div>
        <div className="min-w-0">
          <p className="truncate text-[18px] font-semibold text-white/94">{name}</p>
          <p className="text-[12px] text-white/42">{meta}</p>
        </div>
      </div>
    </motion.div>
  );
}

export const LoginLandingPage = ({
  mode,
  savedIdentity,
  activeIdentity,
  isBusy,
  onContinueSaved,
  onSubmitLearnerAuth,
  onOpenCreate,
  onBackToSaved,
  onForgetSaved,
  onStartSession,
  onSwitchLearner,
}: LoginLandingPageProps) => {
  const [name, setName] = useState(savedIdentity?.learnerName || '');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [formMode, setFormMode] = useState<'signin' | 'create'>(savedIdentity ? 'create' : 'signin');

  useEffect(() => {
    if (mode === 'create') {
      setName(savedIdentity?.learnerName || '');
      setPin('');
      setError('');
      setFormMode(savedIdentity ? 'create' : 'signin');
    }
  }, [mode, savedIdentity]);

  const canSubmit = useMemo(() => {
    return name.trim().length >= 2 && /^\d{4}$/.test(pin);
  }, [name, pin]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const cleanName = name.trim();
    if (cleanName.length < 2) {
      setError('Enter a learner name with at least 2 characters.');
      return;
    }
    if (!/^\d{4}$/.test(pin)) {
      setError('Use a 4-digit PIN.');
      return;
    }
    setError('');
    try {
      await onSubmitLearnerAuth(cleanName, pin, formMode);
      setPin('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to continue. Please try again.';
      setError(message);
    }
  };

  return (
    <section className="relative z-10 flex h-full flex-col overflow-y-auto">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(255,255,255,0.07),transparent_15%),linear-gradient(180deg,rgba(4,6,12,0.1),rgba(4,6,12,0.72)_42%,rgba(4,6,12,0.96))]" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(6,8,12,0.88),rgba(6,8,12,0.48)_42%,rgba(6,8,12,0.84))]" />
      <motion.div
        animate={{ opacity: [0.28, 0.45, 0.28], scale: [0.98, 1.03, 0.98] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute left-1/2 top-[42%] h-[28rem] w-[28rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(133,101,255,0.18),rgba(12,18,30,0)_68%)] blur-3xl"
      />
      <motion.div
        animate={{ opacity: [0.1, 0.22, 0.1], x: [0, 18, 0], y: [0, -14, 0] }}
        transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute right-[10%] top-[18%] h-56 w-56 rounded-full bg-cyan-400/12 blur-3xl"
      />

      <div className="relative flex items-center justify-between px-4 py-4 sm:px-6 lg:px-10">
        <div className="flex items-center gap-3">
          <motion.div
            whileHover={{ rotate: -4, scale: 1.04 }}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-zinc-950 shadow-[0_8px_25px_rgba(255,255,255,0.12)]"
          >
            <Fingerprint size={16} strokeWidth={2.6} />
          </motion.div>
          <div>
            <p className="text-[15px] font-semibold tracking-tight text-white/92">Fingerprint</p>
            <p className="text-[12px] text-white/48">Personalized learning</p>
          </div>
        </div>
      </div>

      <div className="relative flex flex-1 items-center justify-center px-4 pb-8 pt-2 sm:px-6 lg:px-10 lg:pb-10">
        <div className="grid w-full max-w-[1180px] gap-8 lg:grid-cols-[0.82fr_1.18fr] lg:items-center lg:gap-8">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="order-1 mx-auto flex w-full max-w-md flex-col justify-center text-left lg:order-1 lg:mx-0 lg:pl-6"
          >
            <h1 className="font-display max-w-[11ch] text-[32px] leading-[1.02] tracking-[-0.045em] text-white sm:text-[40px] lg:text-[48px]">
              Choose the learner and start the session.
            </h1>
            <p className="mt-4 max-w-[28rem] text-[15px] leading-7 text-white/60">
              Use the same learner name and PIN to keep lessons in sync across devices. You can speak, type, or upload work once you are inside the session.
            </p>
          </motion.div>

          <div className="order-2 mx-auto w-full max-w-[34rem] lg:order-2 lg:max-w-[38rem]">
            <motion.div
              initial={{ opacity: 0, y: 22, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="relative overflow-hidden rounded-[36px] border border-white/[0.14] bg-[linear-gradient(180deg,rgba(24,28,42,0.9),rgba(10,12,20,0.92))] p-5 shadow-[0_36px_140px_rgba(0,0,0,0.58),0_0_0_1px_rgba(255,255,255,0.02),inset_0_1px_0_rgba(255,255,255,0.14)] backdrop-blur-[36px] sm:p-7"
            >
              <div className="pointer-events-none absolute inset-0 rounded-[36px] border border-white/[0.05]" />
              <div className="pointer-events-none absolute inset-[1px] rounded-[35px] border border-white/[0.03]" />
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.48),transparent)]" />
              <div className="pointer-events-none absolute left-[12%] right-[12%] top-0 h-24 rounded-full bg-white/[0.08] blur-3xl" />
              <div className="pointer-events-none absolute inset-y-8 right-0 w-px bg-[linear-gradient(180deg,transparent,rgba(120,220,255,0.32),transparent)]" />
              <div className="pointer-events-none absolute inset-y-10 left-0 w-px bg-[linear-gradient(180deg,transparent,rgba(180,150,255,0.26),transparent)]" />
              <div className="pointer-events-none absolute -right-10 top-16 h-36 w-36 rounded-full bg-cyan-300/[0.11] blur-3xl" />
              <div className="pointer-events-none absolute -left-12 bottom-10 h-40 w-40 rounded-full bg-violet-300/[0.10] blur-3xl" />
              <div className="pointer-events-none absolute inset-x-8 bottom-0 h-20 rounded-full bg-white/[0.03] blur-3xl" />
              <AnimatePresence mode="wait">
                {mode === 'saved' && savedIdentity && (
                  <motion.div
                    key="saved"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="space-y-6"
                  >
                    <div>
                      <h2 className="text-[28px] font-semibold tracking-[-0.03em] text-white/94">Continue with saved learner</h2>
                      <p className="mt-3 max-w-sm text-[14px] leading-6 text-white/48">
                        This device already has a learner profile ready to use.
                      </p>
                    </div>

                    <LearnerPreview
                      name={savedIdentity.learnerName}
                      meta="Saved on this device"
                    />

                    <div className="space-y-3">
                      <PrimaryButton onClick={onContinueSaved}>
                        Continue
                        <ArrowRight size={15} />
                      </PrimaryButton>
                      <SecondaryButton onClick={onOpenCreate}>
                        <Plus size={15} />
                        Create new account
                      </SecondaryButton>
                    </div>
                  </motion.div>
                )}

                {mode === 'create' && (
                  <motion.form
                    key="create"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    onSubmit={handleSubmit}
                    className="space-y-6"
                  >
                    <div>
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.35, delay: 0.06 }}
                        className="relative inline-grid grid-cols-2 rounded-full border border-white/[0.08] bg-white/[0.04] p-1"
                      >
                        <motion.div
                          initial={{ opacity: 0, scale: 0.94 }}
                          animate={{
                            opacity: 1,
                            scale: 1,
                            x: formMode === 'signin' ? '0%' : '100%',
                          }}
                          transition={{ type: 'spring', stiffness: 340, damping: 28 }}
                          className="absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-full bg-white shadow-[0_8px_22px_rgba(255,255,255,0.14)]"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setFormMode('signin');
                            setError('');
                          }}
                          className={`relative z-10 rounded-full px-4 py-2 text-[12px] font-medium transition-all ${
                            formMode === 'signin'
                              ? 'text-zinc-950'
                              : 'text-white/56 hover:text-white/82'
                          }`}
                        >
                          Sign in
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setFormMode('create');
                            setError('');
                          }}
                          className={`relative z-10 rounded-full px-4 py-2 text-[12px] font-medium transition-all ${
                            formMode === 'create'
                              ? 'text-zinc-950'
                              : 'text-white/56 hover:text-white/82'
                          }`}
                        >
                          Create profile
                        </button>
                      </motion.div>
                      <h2 className="mt-5 text-[26px] font-semibold tracking-[-0.03em] text-white/94">
                        {formMode === 'signin' ? 'Sign in with learner details' : 'Create learner profile'}
                      </h2>
                      <p className="mt-3 max-w-sm text-[14px] leading-6 text-white/48">
                        {formMode === 'signin'
                          ? 'Enter the learner name and PIN to open an existing profile.'
                          : 'Use the same learner name and PIN later to reopen this profile on another device.'}
                      </p>
                    </div>

                    <div className="space-y-4">
                      <motion.label whileHover={{ y: -1 }} className="block">
                        <span className="mb-2 block text-[13px] font-medium text-white/68">Learner name</span>
                        <input
                          value={name}
                          onChange={(event) => setName(event.target.value)}
                          placeholder="Enter learner name"
                          className="h-[52px] w-full rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 text-[14px] text-white outline-none transition-all placeholder:text-white/22 focus:border-white/18 focus:bg-white/[0.05]"
                        />
                      </motion.label>

                      <motion.label whileHover={{ y: -1 }} className="block">
                        <span className="mb-2 block text-[13px] font-medium text-white/68">4-digit PIN</span>
                        <input
                          value={pin}
                          onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
                          inputMode="numeric"
                          placeholder="Enter PIN"
                          className="h-[52px] w-full rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 text-[14px] tracking-[0.32em] text-white outline-none transition-all placeholder:tracking-normal placeholder:text-white/22 focus:border-white/18 focus:bg-white/[0.05]"
                        />
                      </motion.label>
                    </div>

                    {error && <p className="text-[12px] text-red-300/88">{error}</p>}

                    <div className="space-y-3">
                      <PrimaryButton type="submit" disabled={!canSubmit || isBusy}>
                        {isBusy ? 'Preparing profile...' : formMode === 'signin' ? 'Continue' : 'Create profile'}
                        {!isBusy && <ArrowRight size={15} />}
                      </PrimaryButton>
                      {savedIdentity && (
                        <SecondaryButton onClick={onBackToSaved} subtle>
                          Back to saved learner
                        </SecondaryButton>
                      )}
                    </div>
                  </motion.form>
                )}

                {mode === 'ready' && activeIdentity && (
                  <motion.div
                    key="ready"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="space-y-6"
                  >
                    <div>
                      <h2 className="text-[28px] font-semibold tracking-[-0.03em] text-white/94">{activeIdentity.learnerName} is ready</h2>
                      <p className="mt-3 max-w-sm text-[14px] leading-6 text-white/48">
                        The learner profile is selected. Start the session when you want to begin.
                      </p>
                    </div>

                    <LearnerPreview
                      name={activeIdentity.learnerName}
                      meta="Profile selected for this session"
                    />

                    <div className="space-y-3">
                      <PrimaryButton onClick={onStartSession}>
                        Start session
                        <ArrowRight size={15} />
                      </PrimaryButton>
                      <SecondaryButton onClick={onSwitchLearner} subtle>
                        Choose another learner
                      </SecondaryButton>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
};
