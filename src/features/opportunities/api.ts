import { getSupabase } from '../../lib/supabase';
import { OPPORTUNITY_COLUMNS, OPPORTUNITY_COLUMNS_BEFORE_0017, type Opportunity, type OpportunityStatus } from './types';

const STATUS_ORDER: Record<OpportunityStatus, number> = { open: 0, rolling: 1, upcoming: 2, closed: 3 };

// 42703 = undefined column: the database hasn't run migration 0017 (is_verified) yet.
const missingColumn = (e: { code?: string } | null) => e?.code === '42703';

/** Published opportunities: open first (soonest deadline), then rolling, upcoming, closed. */
export async function fetchOpportunities(): Promise<Opportunity[]> {
  const list = (cols: string) => getSupabase().from('opportunities').select(cols).eq('published', true);
  let { data, error } = await list(OPPORTUNITY_COLUMNS);
  if (missingColumn(error)) ({ data, error } = await list(OPPORTUNITY_COLUMNS_BEFORE_0017));
  if (error) throw error;
  const rows = (data ?? []) as unknown as Opportunity[];
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
  const one = (cols: string) =>
    getSupabase()
      .from('opportunities')
      .select(cols)
      .eq(isUuid ? 'id' : 'slug', id)
      .eq('published', true)
      .maybeSingle();
  let { data, error } = await one(OPPORTUNITY_COLUMNS);
  if (missingColumn(error)) ({ data, error } = await one(OPPORTUNITY_COLUMNS_BEFORE_0017));
  if (error) throw error;
  return data as unknown as Opportunity | null;
}

/** Pro-only insider guide. The RPC refuses unless active_plan() = 'pro'. */
export async function fetchProInsights(id: string): Promise<string[]> {
  const { data, error } = await getSupabase().rpc('opportunity_pro_insights', { p_opportunity: id });
  if (error) throw error;
  return (data ?? []) as string[];
}
