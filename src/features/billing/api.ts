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
