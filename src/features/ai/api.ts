// INTEGRATION: gemini — all model calls happen in the gemini-chat edge function.
import { invokeFunction } from '../../lib/functions';
import { getSupabase } from '../../lib/supabase';
import type { AiConversation, ChatMessage, ChatUsage } from './types';

export type ChatReply = { conversation_id: string; message: ChatMessage; usage: ChatUsage };

export function sendChat(input: { mode: 'career' | 'lesson'; message: string; conversation_id?: string | null; lesson_id?: string }): Promise<ChatReply> {
  const body: Record<string, unknown> = { mode: input.mode, message: input.message };
  if (input.conversation_id) body.conversation_id = input.conversation_id;
  if (input.lesson_id) body.lesson_id = input.lesson_id;
  return invokeFunction<ChatReply>('gemini-chat', body);
}

/** Latest conversation of a kind (and lesson), so chats survive a refresh. */
export async function latestConversation(kind: 'career' | 'lesson' | 'essay', lessonId?: string): Promise<AiConversation | null> {
  let q = getSupabase()
    .from('ai_conversations')
    .select('id, user_id, kind, lesson_id, title, messages, created_at, updated_at')
    .eq('kind', kind)
    .order('updated_at', { ascending: false })
    .limit(1);
  if (lessonId) q = q.eq('lesson_id', lessonId);
  const { data, error } = await q.maybeSingle();
  if (error) throw error;
  return data as AiConversation | null;
}

export async function deleteConversation(id: string): Promise<void> {
  const { error } = await getSupabase().from('ai_conversations').delete().eq('id', id);
  if (error) throw error;
}

export type EssayTarget = { type: 'opportunity' | 'university'; slug: string };

/** Pro: AI Essay Reviewer. Each review is stored as its own conversation. */
export function reviewEssay(input: { essay: string; prompt?: string; target?: EssayTarget | null }): Promise<ChatReply> {
  const body: Record<string, unknown> = { mode: 'essay', essay: input.essay };
  if (input.prompt?.trim()) body.prompt = input.prompt.trim();
  if (input.target) body.target = input.target;
  return invokeFunction<ChatReply>('gemini-chat', body);
}

/** Past essay reviews, newest first. */
export async function essayHistory(): Promise<AiConversation[]> {
  const { data, error } = await getSupabase()
    .from('ai_conversations')
    .select('id, user_id, kind, lesson_id, title, messages, created_at, updated_at')
    .eq('kind', 'essay')
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) throw error;
  return (data ?? []) as AiConversation[];
}
