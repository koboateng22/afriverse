import { getSupabase } from '../../lib/supabase';
import type { University } from './types';

const COLS = 'id, slug, name, short_name, country, city, currency, app_fee_cents, service_fee_cents, fee_notes, website, description, form_fields, active';

/** Fees always come from the DB (admin-editable) — never hard-coded in the app. */
export async function fetchUniversities(): Promise<University[]> {
  const { data, error } = await getSupabase().from('universities').select(COLS).eq('active', true).order('name');
  if (error) throw error;
  return (data ?? []) as University[];
}

export async function fetchUniversity(idOrSlug: string): Promise<University | null> {
  const isUuid = /^[0-9a-f-]{36}$/i.test(idOrSlug);
  const { data, error } = await getSupabase().from('universities').select(COLS).eq(isUuid ? 'id' : 'slug', idOrSlug).maybeSingle();
  if (error) throw error;
  return data as University | null;
}
