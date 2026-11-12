import { getSupabase } from '../../lib/supabase';

export type AmbassadorStats = {
  referral_code: string;
  signups: number;
  upgrades: number;
  pending_cents: number;
  paid_cents: number;
};

/** The signed-in ambassador's own numbers (RPC from 0018); null for anyone else. */
export async function fetchAmbassadorStats(): Promise<AmbassadorStats | null> {
  const { data, error } = await getSupabase().rpc('ambassador_stats');
  if (error) throw error;
  return (data as AmbassadorStats | null) ?? null;
}

/** "chris10 " → "CHRIS10". Empty when nothing usable was typed. */
export const normalizeCode = (raw: string) => raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);

/** Signup form check. Codes are made to be shared, so anyone may ask. */
export async function referralCodeValid(code: string): Promise<boolean> {
  const { data, error } = await getSupabase().rpc('referral_code_valid', { p_code: code });
  if (error) throw error;
  return data === true;
}

// Google sign-ups leave the site before the account exists, so the code waits
// here and is claimed once they come back signed in (claim_referral, 0018).
const PENDING_KEY = 'afriversity.pending_referral';

export function rememberReferral(code: string) {
  try {
    if (code) localStorage.setItem(PENDING_KEY, code);
    else localStorage.removeItem(PENDING_KEY);
  } catch {
    /* private mode: the code is only lost for Google sign-ups */
  }
}

/** Claims a code saved before a Google sign-up. Safe to call for anyone; it only ever applies once. */
export async function claimPendingReferral(): Promise<void> {
  let code: string | null = null;
  try {
    code = localStorage.getItem(PENDING_KEY);
  } catch {
    return;
  }
  if (!code) return;
  const { error } = await getSupabase().rpc('claim_referral', { p_code: code });
  // Refused (already referred, too late, unknown code) or done: either way, stop trying.
  if (!error) rememberReferral('');
}

// The current site (www.afriversity.com in production), so previews share working links.
const siteUrl = () => window.location.origin;

/** The link an ambassador shares: the code is pre-filled on the signup page. */
export const referralLink = (code: string) => `${siteUrl()}/signup?ref=${encodeURIComponent(code)}`;

export const whatsappShareUrl = (code: string) =>
  `https://wa.me/?text=${encodeURIComponent(
    `I use Afriversity to find scholarships and apply to universities, and the AI counsellor is free. Join with my code ${code}: ${referralLink(code)}`,
  )}`;

export type AmbassadorApplication = { fullName: string; university: string; phone: string; why: string };

/** /ambassador-apply: saves the application and marks the student pending_ambassador (RPC, 0021). */
export async function applyAmbassador(a: AmbassadorApplication): Promise<void> {
  const { error } = await getSupabase().rpc('apply_ambassador', { p_full_name: a.fullName, p_university: a.university, p_phone: a.phone, p_why: a.why });
  if (error) throw error;
}
