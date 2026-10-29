import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '../../lib/supabase';

/** Saved opportunities, persisted in public.saved_opportunities (RLS: own rows). */
export function useSaved(userId: string | undefined) {
  const [saved, setSaved] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    getSupabase()
      .from('saved_opportunities')
      .select('opportunity_id')
      .then(({ data, error: e }) => {
        if (!active) return;
        if (e) setError(e.message);
        else setSaved(new Set((data ?? []).map((r) => r.opportunity_id as string)));
      });
    return () => {
      active = false;
    };
  }, [userId]);

  /** Optimistic toggle; rolls back if the write fails. */
  const toggle = useCallback(
    async (opportunityId: string) => {
      if (!userId) return;
      const wasSaved = saved.has(opportunityId);
      setSaved((prev) => {
        const next = new Set(prev);
        if (wasSaved) next.delete(opportunityId);
        else next.add(opportunityId);
        return next;
      });
      const table = getSupabase().from('saved_opportunities');
      const { error: e } = wasSaved
        ? await table.delete().eq('opportunity_id', opportunityId)
        : await table.insert({ opportunity_id: opportunityId });
      if (e) {
        setError(e.message);
        setSaved((prev) => {
          const next = new Set(prev);
          if (wasSaved) next.add(opportunityId);
          else next.delete(opportunityId);
          return next;
        });
      }
    },
    [saved, userId],
  );

  return { saved, toggle, error };
}
