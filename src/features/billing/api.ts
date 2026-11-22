import { getSupabase } from '../../lib/supabase';
import { invokeFunction } from '../../lib/functions';
import type { PlanRow } from './types';

/** The single Pro plan (price read from the DB — GHS, pesewas). */
export async function fetchProPlan(): Promise<PlanRow | null> {
  const { data, error } = await getSupabase()
    .from('plans')
    .select('code, name, tagline, amount_cents, currency, period_days, ai_daily_limit, features')
    .eq('code', 'pro')
    .eq('active', true)
    .maybeSingle();
  if (error) throw error;
  return data as PlanRow | null;
}

/**
 * Preview of a promo code: its percentage off, or null if it doesn't exist or is switched off.
 * paystack-init checks the code again and prices the charge, so this only drives the display.
 */
export async function checkPromoCode(code: string): Promise<number | null> {
  const { data, error } = await getSupabase().rpc('promo_code_discount', { p_code: code.trim() });
  if (error) throw error;
  return typeof data === 'number' && data > 0 ? data : null;
}

/** Pro's price after a percentage off, in whole pesewas (the same sum paystack-init does). */
export function discountedCents(baseCents: number, percentage: number): number {
  return Math.round((baseCents * (100 - percentage)) / 100);
}

export async function fetchFreeAiLimit(): Promise<number> {
  const { data } = await getSupabase().from('app_settings').select('value').eq('key', 'free_ai_daily_limit').maybeSingle();
  return Number(data?.value ?? 50);
}

// INTEGRATION: paystack — stop card auto-renew / get Paystack's card-update page.
export function cancelAutoRenew(): Promise<{ status: string }> {
  return invokeFunction('paystack-subscription', { action: 'cancel' });
}

export function cardManageLink(): Promise<{ link: string }> {
  return invokeFunction('paystack-subscription', { action: 'manage_link' });
}

/** Pro-only: the human counsellor's WhatsApp number (RPC checks active_plan()). */
export async function fetchCounselorContact(): Promise<{ whatsapp: string; hours: string }> {
  const { data, error } = await getSupabase().rpc('counselor_contact');
  if (error) throw error;
  return data as { whatsapp: string; hours: string };
}

/** Public setting: the WhatsApp number students can send documents to. */
export async function fetchSupportWhatsapp(): Promise<string> {
  const { data } = await getSupabase().from('app_settings').select('value').eq('key', 'support_whatsapp').maybeSingle();
  return typeof data?.value === 'string' ? data.value : '';
}

export function whatsappLink(number: string, text: string): string {
  return `https://wa.me/${number.replace(/[^\d]/g, '')}?text=${encodeURIComponent(text)}`;
}

// ── Pay-as-you-go ────────────────────────────────────────────────────────

export type ProductCode = 'cv_download' | 'essay_review';
export type OneTimeProduct = { code: ProductCode; name: string; amount_cents: number; currency: string };
/** Shown until the rows load; mirrors migration 0024 (paystack-init always prices from the table). */
export const PRODUCT_FALLBACK: Record<ProductCode, OneTimeProduct> = {
  cv_download: { code: 'cv_download', name: 'Professional CV download (PDF)', amount_cents: 1000, currency: 'GHS' },
  essay_review: { code: 'essay_review', name: 'VIP Essay Review by a human counsellor', amount_cents: 1500, currency: 'GHS' },
};

export async function fetchOneTimeProducts(): Promise<Record<ProductCode, OneTimeProduct>> {
  const { data, error } = await getSupabase().from('one_time_products').select('code, name, amount_cents, currency').eq('active', true);
  if (error) throw error;
  const out = { ...PRODUCT_FALLBACK };
  for (const row of (data ?? []) as OneTimeProduct[]) out[row.code] = row;
  return out;
}

/** How many students use Afriversity (a real count, for the paywall's social proof). */
export async function fetchCommunitySize(): Promise<number | null> {
  const { data, error } = await getSupabase().rpc('community_size');
  if (error) return null;
  return typeof data === 'number' ? data : null;
}

export type CounselorStatus = {
  pro: boolean;
  free_review_claimed_at: string | null;
  paid_reviews: number;
  /** Only present when the student may message the counsellor. */
  whatsapp: string | null;
  hours: string | null;
};

export async function fetchCounselorStatus(): Promise<CounselorStatus> {
  const { data, error } = await getSupabase().rpc('counselor_status');
  if (error) throw error;
  return data as CounselorStatus;
}

/** Uses the one free human review. Returns the WhatsApp number to message. */
export async function claimFreeReview(): Promise<{ whatsapp: string | null; claimed_at: string }> {
  const { data, error } = await getSupabase().rpc('claim_free_review');
  if (error) throw error;
  return data as { whatsapp: string | null; claimed_at: string };
}

export type Purchase = {
  id: string;
  product: ProductCode;
  status: 'pending' | 'paid' | 'failed';
  amount_cents: number;
  currency: string;
  cv_id: string | null;
  payment_ref: string | null;
  paid_at: string | null;
  created_at: string;
};

export async function fetchMyPurchases(): Promise<Purchase[]> {
  const { data, error } = await getSupabase()
    .from('purchases')
    .select('id, product, status, amount_cents, currency, cv_id, payment_ref, paid_at, created_at')
    .eq('status', 'paid')
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data ?? []) as Purchase[];
}

/** Rounds the student count down to a milestone: 237 → "200+". */
export function communityLabel(n: number | null): string | null {
  if (!n || n < 50) return null;
  const step = n >= 1000 ? 500 : n >= 200 ? 100 : 50;
  return `${Math.floor(n / step) * step}+`;
}
