import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getSupabase } from '../../lib/supabase';
import { useAuth } from '../auth/useAuth';
import { isStudent as isStudentRole } from '../profiles/types';
import type { BillingCustomer, Plan, Subscription } from './types';

export type PlanState = {
  /** From the active_plan() SQL helper — expiry is enforced server-side. */
  plan: Plan | null;
  isPro: boolean;
  /** The subscription currently granting access (null on the free plan). */
  current: Subscription | null;
  /** Most recent subscription that has ended (for the renewal banner). */
  lastEnded: Subscription | null;
  /** Card auto-renew status, when the student pays by card. */
  billing: BillingCustomer | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

const PlanContext = createContext<PlanState | null>(null);

export function PlanProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [current, setCurrent] = useState<Subscription | null>(null);
  const [lastEnded, setLastEnded] = useState<Subscription | null>(null);
  const [billing, setBilling] = useState<BillingCustomer | null>(null);
  const [loading, setLoading] = useState(true);
  const isStudent = isStudentRole(profile?.role);

  const refresh = useCallback(async () => {
    if (!isStudent) {
      setPlan(null);
      setCurrent(null);
      setLastEnded(null);
      setBilling(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const sb = getSupabase();
    const [{ data: p }, { data: subs }, { data: b }] = await Promise.all([
      sb.rpc('active_plan'),
      sb
        .from('subscriptions')
        .select('id, user_id, plan, status, billing, currency, amount_cents, payment_ref, starts_at, expires_at, created_at')
        .in('status', ['active', 'expired'])
        .order('expires_at', { ascending: false })
        .limit(12),
      sb.from('billing_customers').select('user_id, status, next_payment_date').maybeSingle(),
    ]);
    const rows = (subs ?? []) as Subscription[];
    const now = Date.now();
    const activePlan = (p as Plan | null) ?? null;
    setPlan(activePlan);
    setCurrent(
      rows.find((s) => s.starts_at && s.expires_at && new Date(s.starts_at).getTime() <= now && new Date(s.expires_at).getTime() > now) ?? null,
    );
    setLastEnded(rows.find((s) => s.expires_at && new Date(s.expires_at).getTime() <= now) ?? null);
    setBilling((b as BillingCustomer | null) ?? null);
    setLoading(false);
  }, [isStudent]);

  useEffect(() => {
    void refresh();
  }, [refresh, profile?.id]);

  const value = useMemo(
    () => ({ plan, isPro: plan === 'pro', current, lastEnded, billing, loading, refresh }),
    [plan, current, lastEnded, billing, loading, refresh],
  );
  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}

export function usePlan(): PlanState {
  const ctx = useContext(PlanContext);
  if (!ctx) throw new Error('usePlan must be used inside <PlanProvider>');
  return ctx;
}
