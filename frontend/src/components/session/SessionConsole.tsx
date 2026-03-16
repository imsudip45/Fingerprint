import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ImagePlus, Mic, MicOff, PhoneOff, Rocket, AudioLines } from 'lucide-react';
import { AppState } from '../../types';

interface SessionConsoleProps {
  isConnected: boolean;
  isMuted: boolean;
  appState: AppState;
  currentTopic: string | null;
  onToggleConnection: () => void;
  onToggleMute: () => void;
  onReaction?: (emoji: string) => void;
  onUploadVisual?: (file: File) => void;
  onSend: (text: string) => boolean;
}

const reactions = [
  { emoji: '🤩', label: 'Love it' },
  { emoji: '🤔', label: 'Confused' },
  { emoji: '😴', label: 'Bored' },
];

export function SessionConsole({
  isConnected,
  isMuted,
  appState,
  currentTopic,
  onToggleConnection,
  onToggleMute,
  onReaction,
  onUploadVisual,
  onSend,
}: SessionConsoleProps) {
  const [draft, setDraft] = useState('');
  const [shouldPulseInterruptHint, setShouldPulseInterruptHint] = useState(false);
  const prevAppStateRef = useRef<AppState>('idle');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const enteredSpeaking = prevAppStateRef.current !== 'speaking' && appState === 'speaking';
    if (enteredSpeaking && isMuted) {
      setShouldPulseInterruptHint(true);
      const timeout = setTimeout(() => setShouldPulseInterruptHint(false), 900);
      prevAppStateRef.current = appState;
      return () => clearTimeout(timeout);
    }
    if (appState !== 'speaking') {
      setShouldPulseInterruptHint(false);
    }
    prevAppStateRef.current = appState;
  }, [appState, isMuted]);

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const sent = onSend(draft);
    if (sent) setDraft('');
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      submit(event);
    }
  };

  const busyLabel =
    appState === 'thinking'
      ? 'Fingerprint is thinking...'
      : appState === 'speaking'
        ? 'Fingerprint is speaking (you can interrupt)...'
        : '';

  return (
    <AnimatePresence>
      {isConnected && (
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="relative z-30 mt-auto px-3 pb-4 sm:px-4 sm:pb-6"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file && onUploadVisual) onUploadVisual(file);
              event.currentTarget.value = '';
            }}
          />

          <form
            onSubmit={submit}
            className="mx-auto w-full max-w-[48rem]"
          >
            <div className="flex flex-col gap-2 relative">
              {currentTopic && onReaction ? (
                <div className="flex gap-2 overflow-x-auto pb-1 px-2 no-scrollbar">
                  {reactions.map(({ emoji, label }) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => onReaction(emoji)}
                      title={label}
                      className="inline-flex h-9 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-black/40 px-3.5 text-[12px] text-white/72 backdrop-blur-md transition-colors hover:bg-white/[0.08] hover:text-white"
                    >
                      <span className="mr-1.5 text-[14px]">{emoji}</span>
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              ) : null}

              <div className="flex items-end gap-2 sm:gap-3">
                <div className="relative flex min-h-[52px] flex-1 items-center rounded-full bg-[#18181b] pl-2 pr-1.5 py-1 shadow-lg border border-white/5 transition-colors focus-within:border-white/10 focus-within:bg-[#1f1f23]">
                  {/* Left: Attachment */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white/40 transition-colors hover:bg-white/10 hover:text-white"
                    title="Attach image"
                  >
                    <ImagePlus size={18} />
                  </button>

                  <textarea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={handleKeyDown}
                    rows={1}
                    placeholder="Ask anything"
                    className="max-h-[140px] min-h-[32px] flex-1 resize-none bg-transparent px-3 py-[14px] text-[15px] leading-5 text-white outline-none placeholder:text-white/30"
                  />

                  {/* Right: Actions */}
                  <div className="flex shrink-0 items-center gap-1 pr-1">
                    <button
                      type="button"
                      onClick={onToggleMute}
                      className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors ${
                        isMuted
                          ? 'text-red-400 hover:bg-red-400/10'
                          : 'text-white/60 hover:bg-white/10 hover:text-white'
                      }`}
                      title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
                    >
                      {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
                    </button>

                    <button
                      type="button"
                      onClick={onToggleConnection}
                      className="flex h-10 px-4 shrink-0 items-center justify-center rounded-full bg-red-600 text-white text-[14px] font-medium transition-all hover:bg-red-500 hover:scale-105 shadow-sm"
                      title="End session"
                      aria-label="End session"
                    >
                      End
                    </button>
                  </div>
                </div>
              </div>

              {/* Status Row */}
              <div className="flex min-h-[20px] items-center justify-between px-4 text-[12px]">
                <div className="text-white/40">{busyLabel}</div>
              </div>
            </div>
          </form>
        </motion.section>
      )}
    </AnimatePresence>
  );
}

