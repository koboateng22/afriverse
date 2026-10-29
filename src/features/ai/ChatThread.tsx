import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUp, BookOpen, Building2, GraduationCap, Sparkles } from 'lucide-react';
import { Notice } from '../../components/Notice/Notice';
import { ChatSkeleton } from '../../components/Skeleton/Skeleton';
import { press, spring } from '../../lib/motion';
import { usePaywall } from '../billing/PaywallModal';
import type { ChatMessage, ChatUsage, RelatedItem } from './types';
import type { ChatLimit } from './useChat';
import './ChatThread.css';

export type ChatThreadProps = {
  messages: ChatMessage[];
  loading: boolean;
  sending: boolean;
  error: string | null;
  limit: ChatLimit | null;
  usage?: ChatUsage | null;
  onSend: (text: string) => Promise<void>;
  placeholder: string;
  suggestions?: string[];
  /** Extra content under an assistant message (e.g. career cards). */
  renderExtra?: (m: ChatMessage, index: number) => ReactNode;
  emptyTitle: string;
};

/** Chat bubbles that slide in, a typing indicator, and a pinned composer. */
const RELATED_ICON = { opportunity: GraduationCap, university: Building2, course: BookOpen } as const;
const relatedHref = (r: RelatedItem) => (r.type === 'opportunity' ? `/opportunity/${r.slug}` : r.type === 'university' ? `/apply-university/${r.slug}` : `/courses/${r.slug}`);

/** The counsellor's mark: a small glowing orb beside every AI message. */
function AiAvatar() {
  return (
    <span className="chat__avatar" aria-hidden="true">
      <Sparkles />
    </span>
  );
}

export function ChatThread({ messages, loading, sending, error, limit, usage, onSend, placeholder, suggestions = [], renderExtra, emptyTitle }: ChatThreadProps) {
  const { openPaywall } = usePaywall();
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const lastAssistant = messages.reduce((acc, m, i) => (m.role === 'assistant' ? i : acc), -1);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, sending]);

  const submit = async (e?: FormEvent, text = draft) => {
    e?.preventDefault();
    if (!text.trim()) return;
    setDraft('');
    try {
      await onSend(text);
    } catch {
      setDraft(text); // give the words back so nothing is lost
    }
  };

  return (
    <div className="chat">
      <div className="chat__log" role="log" aria-live="polite" aria-busy={loading || sending}>
        {loading ? (
          <ChatSkeleton />
        ) : messages.length === 0 ? (
          <motion.div className="chat__empty" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <Sparkles aria-hidden="true" className="chat__empty-icon" />
            <p className="chat__empty-title">{emptyTitle}</p>
            {suggestions.length > 0 && (
              <div className="chat__suggestions">
                {suggestions.map((s) => (
                  <motion.button key={s} type="button" className="chat__suggestion" whileTap={press} onClick={() => submit(undefined, s)} disabled={sending}>
                    {s}
                  </motion.button>
                ))}
              </div>
            )}
          </motion.div>
        ) : (
          <AnimatePresence initial={false}>
            {messages.map((m, i) => (
              <motion.div
                key={`${m.at}-${i}`}
                className="chat__row"
                data-role={m.role}
                data-latest={i === lastAssistant || undefined}
                initial={{ opacity: 0, x: m.role === 'user' ? 24 : -24, scale: 0.98 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                transition={spring}
              >
                {m.role === 'assistant' && <AiAvatar />}
                <div className="chat__bubble">
                  {m.source === 'library' && <span className="chat__source">From the Afriversity careers library</span>}
                  <p>{m.content}</p>
                </div>
                {m.role === 'assistant' && m.related && m.related.length > 0 && (
                  <div className="chat__related" aria-label="From Afriversity">
                    {m.related.map((r) => {
                      const Icon = RELATED_ICON[r.type];
                      return (
                        <Link key={`${r.type}-${r.slug}`} to={relatedHref(r)} className="chat__related-chip">
                          <Icon aria-hidden="true" />
                          {r.title}
                        </Link>
                      );
                    })}
                  </div>
                )}
                {m.role === 'assistant' && renderExtra?.(m, i)}
              </motion.div>
            ))}
          </AnimatePresence>
        )}
        <AnimatePresence>
          {sending && (
            <motion.div
              className="chat__row"
              data-role="assistant"
              data-typing
              initial={{ opacity: 0, y: 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
              transition={spring}
            >
              <AiAvatar />
              <div className="chat__bubble chat__typing" role="status">
                <span className="visually-hidden">Your counsellor is typing</span>
                <span className="chat__dot" aria-hidden="true" />
                <span className="chat__dot" aria-hidden="true" />
                <span className="chat__dot" aria-hidden="true" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {/* scroll-margin (CSS) keeps the newest message clear of the sticky composer + nav. */}
        <div ref={endRef} className="chat__end" aria-hidden="true" />
      </div>

      {error && <Notice tone="error">{error}</Notice>}
      {limit && (
        <Notice
          tone="info"
          action={
            <button type="button" className="chat__upgrade" onClick={() => openPaywall(`You've used your ${limit.limit} free AI messages for today.`)}>
              Upgrade to Pro
            </button>
          }
        >
          You've used today's {limit.limit} free AI messages. Each one frees up 24 hours after you sent it.
        </Notice>
      )}

      {usage && usage.limit !== null && !limit && (
        <p className="chat__usage" aria-live="polite">
          {Math.max(0, usage.limit - usage.used)} of {usage.limit} free AI messages left today
        </p>
      )}

      <form className="chat__composer" onSubmit={submit}>
        <label className="visually-hidden" htmlFor="chat-input">
          Message
        </label>
        <textarea
          id="chat-input"
          className="chat__input"
          rows={1}
          maxLength={2000}
          placeholder={placeholder}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
        />
        <motion.button type="submit" className="chat__send" disabled={!draft.trim() || sending} whileTap={press} aria-label="Send message">
          <ArrowUp aria-hidden="true" />
        </motion.button>
      </form>
    </div>
  );
}
