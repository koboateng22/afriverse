// INTEGRATION: groq — all model calls happen in the `gemini-chat` edge function (name kept from the Gemini era).
import { invokeFunction } from '../../lib/functions';
import type { Destination, EssayType, LimitUnit } from './essay';
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

export type EssayRequest = {
  essay: string;
  destination: Destination;
  country?: string;
  essay_type: EssayType | 'auto';
  university?: string;
  programme?: string;
  prompt?: string;
  limit?: { value: number; unit: LimitUnit } | null;
  /** A listed scholarship (opportunity slug), for scholarship essays. */
  scholarship_slug?: string;
};

/** AI Essay Reviewer (international applications). Each review is stored as its own conversation. */
export function reviewEssay(input: EssayRequest): Promise<ChatReply> {
  const body: Record<string, unknown> = { mode: 'essay' };
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined || v === null || (typeof v === 'string' && !v.trim())) continue;
    body[k] = typeof v === 'string' ? v.trim() : v;
  }
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
