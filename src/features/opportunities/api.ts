import { getSupabase } from '../../lib/supabase';
import { OPPORTUNITY_COLUMNS, type Opportunity, type OpportunityStatus } from './types';

const STATUS_ORDER: Record<OpportunityStatus, number> = { open: 0, rolling: 1, upcoming: 2, closed: 3 };

/** Published opportunities: open first (soonest deadline), then rolling, upcoming, closed. */
export async function fetchOpportunities(): Promise<Opportunity[]> {
  const { data, error } = await getSupabase().from('opportunities').select(OPPORTUNITY_COLUMNS).eq('published', true);
  if (error) throw error;
  const rows = (data ?? []) as Opportunity[];
  return rows.sort((a, b) => {
    const s = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (s !== 0) return s;
    if (a.featured !== b.featured) return a.featured ? -1 : 1;
    const da = a.deadline ?? a.opens_on ?? '9999';
    const db = b.deadline ?? b.opens_on ?? '9999';
    return da.localeCompare(db);
  });
}

export async function fetchOpportunity(id: string): Promise<Opportunity | null> {
  const isUuid = /^[0-9a-f-]{36}$/i.test(id);
  const { data, error } = await getSupabase()
    .from('opportunities')
    .select(OPPORTUNITY_COLUMNS)
    .eq(isUuid ? 'id' : 'slug', id)
    .eq('published', true)
    .maybeSingle();
  if (error) throw error;
  return data as Opportunity | null;
}

/** Pro-only insider guide. The RPC refuses unless active_plan() = 'pro'. */
export async function fetchProInsights(id: string): Promise<string[]> {
  const { data, error } = await getSupabase().rpc('opportunity_pro_insights', { p_opportunity: id });
  if (error) throw error;
  return (data ?? []) as string[];
}
