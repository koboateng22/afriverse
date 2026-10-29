import { getSupabase } from '../../lib/supabase';

const callbackUrl = () => `${window.location.origin}/auth/callback`;

export type SignupAs = 'student' | 'mentor';

export async function signUpWithEmail(input: { email: string; password: string; fullName: string; as: SignupAs }) {
  const { data, error } = await getSupabase().auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      emailRedirectTo: callbackUrl(),
      // `signup_as` is read by the handle_new_user trigger, which only accepts
      // 'student' or 'mentor' (mentors start as pending). Admin can't be requested.
      data: { full_name: input.fullName, signup_as: input.as },
    },
  });
  if (error) throw error;
  return { needsConfirmation: !data.session };
}

export async function signInWithEmail(email: string, password: string) {
  const { error } = await getSupabase().auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signInWithGoogle() {
  const { error } = await getSupabase().auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: callbackUrl() },
  });
  if (error) throw error;
}

/** Sends an SMS code. Creates the account on first use (student role). */
export async function sendPhoneOtp(phone: string, fullName?: string) {
  const { error } = await getSupabase().auth.signInWithOtp({
    phone,
    options: { shouldCreateUser: true, data: fullName ? { full_name: fullName, signup_as: 'student' } : { signup_as: 'student' } },
  });
  if (error) throw error;
}

export async function verifyPhoneOtp(phone: string, token: string) {
  const { error } = await getSupabase().auth.verifyOtp({ phone, token, type: 'sms' });
  if (error) throw error;
}

/** Light E.164 normaliser: "0551234987" + Ghana → "+233551234987". */
export function toE164(raw: string, defaultCountryCode = '233'): string {
  const digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  if (digits.startsWith('00')) return `+${digits.slice(2)}`;
  if (digits.startsWith('0')) return `+${defaultCountryCode}${digits.slice(1)}`;
  return `+${digits}`;
}
