import { useCallback, useEffect, useState } from 'react';
import { FunctionError, TIMEOUT_CODE } from '../../lib/functions';
import { errorMessage, getSupabase } from '../../lib/supabase';
import { fetchFreeAiLimit } from '../billing/api';
import { FALLBACK_REPLY, latestConversation, sendChat } from './api';
import type { ChatMessage, ChatUsage } from './types';

export type ChatLimit = { limit: number; plan: string | null };

/**
 * Loads the latest saved conversation, sends messages, tracks usage.
 * The AI is free for everyone; the server's daily allowance (anti-spam, same
 * for every plan) answers 429 daily_limit when it runs out.
 */
export function useChat(mode: 'career' | 'lesson', lessonId?: string) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState<ChatLimit | null>(null);
  const [usage, setUsage] = useState<ChatUsage | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setMessages([]);
    setConversationId(null);
    latestConversation(mode, lessonId)
      .then((c) => {
        if (!active || !c) return;
        setConversationId(c.id);
        setMessages(c.messages ?? []);
      })
      .catch((e) => active && setError(errorMessage(e)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [mode, lessonId]);

  // Today's allowance, before the first send (the counter only shows near the limit).
  useEffect(() => {
    let active = true;
    const since = new Date(Date.now() - 86_400_000).toISOString();
    Promise.all([fetchFreeAiLimit(), getSupabase().from('ai_usage').select('id', { count: 'exact', head: true }).gte('created_at', since)])
      .then(([l, { count }]) => active && setUsage({ used: count ?? 0, limit: l, plan: null }))
      .catch(() => {
        /* the counter is a convenience; the server still enforces the limit */
      });
    return () => {
      active = false;
    };
  }, []);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sending) return;
      setError(null);
      setLimit(null);
      const optimistic: ChatMessage = { role: 'user', content: trimmed, at: new Date().toISOString() };
      setMessages((m) => [...m, optimistic]);
      setSending(true);
      // Busy, slow or unreachable AI: keep the question on screen and answer with the
      // fallback message plus a Retry button (nothing was saved on the server).
      const showFallback = (reply = FALLBACK_REPLY) =>
        setMessages((m) => [...m, { role: 'assistant', content: reply, at: new Date().toISOString(), source: 'fallback', retry: trimmed }]);
      try {
        const res = await sendChat({ mode, message: trimmed, conversation_id: conversationId, lesson_id: lessonId });
        if (res.is_fallback) {
          showFallback(res.reply);
          return;
        }
        setConversationId(res.conversation_id);
        setMessages((m) => [...m, res.message]);
        setUsage(res.usage);
      } catch (e) {
        if (e instanceof FunctionError && (e.code === TIMEOUT_CODE || e.code === 'network' || e.status >= 500)) {
          showFallback();
          return;
        }
        setMessages((m) => m.filter((x) => x !== optimistic));
        if (e instanceof FunctionError && e.code === 'daily_limit') {
          const l = Number(e.body.limit ?? 50);
          setLimit({ limit: l, plan: (e.body.plan as string | null) ?? null });
          setUsage({ used: Number(e.body.used ?? l), limit: l, plan: null });
        } else {
          setError(errorMessage(e));
        }
        throw e;
      } finally {
        setSending(false);
      }
    },
    [mode, lessonId, conversationId, sending],
  );

  /** Sends the question behind the latest fallback answer again. */
  const retry = useCallback(async () => {
    const last = messages[messages.length - 1];
    if (!last || last.source !== 'fallback' || !last.retry || sending) return;
    // Drop the fallback and the unanswered question; send() puts the question back.
    setMessages((m) => m.slice(0, -2));
    await send(last.retry).catch(() => undefined);
  }, [messages, sending, send]);

  const reset = useCallback(() => {
    setConversationId(null);
    setMessages([]);
  }, []);

  return { messages, loading, sending, error, limit, usage, send, retry, reset, conversationId };
}
