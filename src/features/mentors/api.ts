import { getSupabase } from '../../lib/supabase';
import type { MentorSession } from '../billing/types';
import { MENTOR_COLUMNS, OWN_MENTOR_COLUMNS, type Mentor } from './types';

export async function fetchOwnMentor(userId: string): Promise<Mentor | null> {
  const { data, error } = await getSupabase().from('mentors').select(OWN_MENTOR_COLUMNS).eq('id', userId).maybeSingle();
  if (error) throw error;
  return data as Mentor | null;
}

/** Approved mentors only (RLS also enforces this for students). */
export async function fetchMentors(): Promise<Mentor[]> {
  const { data, error } = await getSupabase().from('mentors').select(MENTOR_COLUMNS).eq('status', 'approved').order('display_name');
  if (error) throw error;
  return (data ?? []) as Mentor[];
}

export async function fetchMentor(id: string): Promise<Mentor | null> {
  const { data, error } = await getSupabase().from('mentors').select(MENTOR_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw error;
  return data as Mentor | null;
}

export type MentorProfileUpdate = Pick<Mentor, 'display_name' | 'headline' | 'bio' | 'expertise' | 'country' | 'availability'> & { proposed_rate_cents?: number | null };

export async function updateOwnMentor(id: string, patch: MentorProfileUpdate): Promise<Mentor> {
  const { data, error } = await getSupabase().from('mentors').update(patch).eq('id', id).select(OWN_MENTOR_COLUMNS).single();
  if (error) throw error;
  return data as Mentor;
}

export type SessionWithNames = MentorSession & { mentor_name: string; student_name: string };

/** Sessions visible to the caller (as student or mentor), with counterpart names. */
export async function fetchMySessions(): Promise<SessionWithNames[]> {
  const sb = getSupabase();
  const [{ data: rows, error }, { data: names, error: e2 }] = await Promise.all([
    sb
      .from('mentor_sessions')
      .select('id, mentor_id, student_id, scheduled_at, duration_min, topic, status, currency, amount_cents, payment_ref, created_at')
      .in('status', ['confirmed', 'completed'])
      .order('scheduled_at', { ascending: true }),
    sb.rpc('session_counterparts'),
  ]);
  if (error) throw error;
  if (e2) throw e2;
  const byId = new Map(((names ?? []) as Array<{ session_id: string; mentor_name: string; student_name: string }>).map((n) => [n.session_id, n]));
  return ((rows ?? []) as MentorSession[]).map((s) => ({
    ...s,
    mentor_name: byId.get(s.id)?.mentor_name ?? 'Mentor',
    student_name: byId.get(s.id)?.student_name ?? 'Student',
  }));
}

export async function completeSession(id: string): Promise<void> {
  const { error } = await getSupabase().rpc('mentor_complete_session', { p_session: id });
  if (error) throw error;
}
