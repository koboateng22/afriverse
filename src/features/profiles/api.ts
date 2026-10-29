import { getSupabase } from '../../lib/supabase';
import { PROFILE_COLUMNS, type Profile, type ProfileUpdate } from './types';

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await getSupabase().from('profiles').select(PROFILE_COLUMNS).eq('id', userId).maybeSingle();
  if (error) throw error;
  return data as Profile | null;
}

export async function updateProfile(userId: string, patch: ProfileUpdate): Promise<Profile> {
  const { data, error } = await getSupabase().from('profiles').update(patch).eq('id', userId).select(PROFILE_COLUMNS).single();
  if (error) throw error;
  return data as Profile;
}

/** Share of the profile a student has filled in (drives the progress ring). */
export function profileCompletion(p: Profile | null): { percent: number; missing: string[] } {
  if (!p) return { percent: 0, missing: [] };
  const checks: Array<[string, boolean]> = [
    ['Name', Boolean(p.full_name?.trim())],
    ['Country', Boolean(p.country)],
    ['Education level', Boolean(p.education_level)],
    ['Field of interest', Boolean(p.field_of_interest)],
    ['Goals', p.goals.length > 0],
    ['Phone', Boolean(p.phone?.trim())],
    ['Short bio', Boolean(p.bio?.trim())],
  ];
  const done = checks.filter(([, ok]) => ok).length;
  return { percent: Math.round((done / checks.length) * 100), missing: checks.filter(([, ok]) => !ok).map(([k]) => k) };
}
