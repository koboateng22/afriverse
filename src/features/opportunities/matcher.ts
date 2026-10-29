import { useEffect, useState } from 'react';
import { getSupabase } from '../../lib/supabase';
import { usePlan } from '../billing/PlanProvider';

export type Match = { score: number; reasons: string[] };

export const MATCH_STRONG = 70;

/**
 * Pro Scholarship Matcher. The ranking comes from the scholarship_matches()
 * RPC, which refuses unless active_plan() = 'pro' — free students never get
 * scores, only the upgrade prompt.
 */
export function useMatches(): { matches: Map<string, Match> | null; error: string | null } {
  const { isPro, loading } = usePlan();
  const [matches, setMatches] = useState<Map<string, Match> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading || !isPro) {
      setMatches(null);
      return;
    }
    let active = true;
    getSupabase()
      .rpc('scholarship_matches')
      .then(({ data, error: e }) => {
        if (!active) return;
        if (e) setError(e.message);
        else setMatches(new Map(((data ?? []) as Array<{ opportunity_id: string; score: number; reasons: string[] }>).map((r) => [r.opportunity_id, { score: r.score, reasons: r.reasons }])));
      });
    return () => {
      active = false;
    };
  }, [isPro, loading]);

  return { matches, error };
}
