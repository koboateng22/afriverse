import { useCallback, useEffect, useState } from 'react';
import { FunctionError } from '../../lib/functions';
import { errorMessage, getSupabase } from '../../lib/supabase';
import { usePaywall } from '../billing/PaywallModal';
import { usePlan } from '../billing/PlanProvider';
import { fetchFreeAiLimit } from '../billing/api';
import { latestConversation, sendChat } from './api';
import type { ChatMessage, ChatUsage } from './types';

export type ChatLimit = { limit: number; plan: string | null };

/**
 * Loads the latest saved conversation, sends messages, tracks usage.
 * When the free daily allowance (3) runs out, the server answers 429
 * daily_limit and we open the Pro paywall modal.
 */
export function useChat(mode: 'career' | 'lesson', lessonId?: string) {
  const { openPaywall } = usePaywall();
  const { isPro, loading: planLoading } = usePlan();
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

  // Free plan: show how many of today's messages are left before the first send.
  useEffect(() => {
    if (planLoading || isPro) {
      if (isPro) setUsage(null);
      return;
    }
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
  }, [isPro, planLoading]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sending) return;
      setError(null);
      setLimit(null);
      const optimistic: ChatMessage = { role: 'user', content: trimmed, at: new Date().toISOString() };
      setMessages((m) => [...m, optimistic]);
      setSending(true);
      try {
        const res = await sendChat({ mode, message: trimmed, conversation_id: conversationId, lesson_id: lessonId });
        setConversationId(res.conversation_id);
        setMessages((m) => [...m, res.message]);
        setUsage(res.usage);
      } catch (e) {
        setMessages((m) => m.filter((x) => x !== optimistic));
        if (e instanceof FunctionError && e.code === 'daily_limit') {
          const l = Number(e.body.limit ?? 3);
          setLimit({ limit: l, plan: (e.body.plan as string | null) ?? null });
          setUsage({ used: Number(e.body.used ?? l), limit: l, plan: null });
          openPaywall(`You've used your ${l} free AI messages for today. Pro gives you unlimited messages.`);
        } else {
          setError(errorMessage(e));
        }
        throw e;
      } finally {
        setSending(false);
      }
    },
    [mode, lessonId, conversationId, sending, openPaywall],
  );

  const reset = useCallback(() => {
    setConversationId(null);
    setMessages([]);
  }, []);

  return { messages, loading, sending, error, limit, usage, send, reset, conversationId };
}
