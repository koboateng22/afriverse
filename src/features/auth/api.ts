import { getSupabase } from '../../lib/supabase';

const callbackUrl = () => `${window.location.origin}/auth/callback`;

export type SignupAs = 'student' | 'mentor';

/** Thrown when the email already has an account; the form offers a sign-in link instead. */
export class EmailTakenError extends Error {
  constructor() {
    super('This email is already registered. Please sign in instead.');
    this.name = 'EmailTakenError';
  }
}

export type MentorApplication = { expertise: string; rate_cents: number; linkedin_url: string };

export async function signUpWithEmail(input: {
  email: string;
  password: string;
  fullName: string;
  as: SignupAs;
  referralCode?: string;
  mentorApplication?: MentorApplication;
}) {
  const { data, error } = await getSupabase().auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      emailRedirectTo: callbackUrl(),
      // `signup_as` is read by the handle_new_user trigger, which only accepts
      // 'student' or 'mentor' (mentors start as pending). Admin can't be requested.
      // referral_code: an ambassador's code; the trigger keeps it only if it's live (0018).
      // mentor_application: saved to mentor_applications by the same trigger (0021).
      data: {
        full_name: input.fullName,
        signup_as: input.as,
        ...(input.referralCode ? { referral_code: input.referralCode } : {}),
        ...(input.mentorApplication ? { mentor_application: input.mentorApplication } : {}),
      },
    },
  });
  // With email confirmation off, Supabase says so directly.
  if (error && /already (been )?registered|already exists/i.test(error.message)) throw new EmailTakenError();
  if (error) throw error;
  // With confirmation on, it hides that the email exists: a user with no identities comes back.
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) throw new EmailTakenError();
  return { needsConfirmation: !data.session };
}

/** Sends the 6-digit reset code. Always "succeeds" to the caller, so nobody can probe which emails have accounts. */
export async function requestPasswordReset(email: string) {
  // redirectTo only matters while an old link-style template is still live.
  const { error } = await getSupabase().auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/update-password` });
  if (error && isRateLimited(error)) throw new Error('Too many reset requests. Wait a minute, then try again.');
}

// ── Email codes (6-digit OTP) ────────────────────────────────────────────
// The emails carry {{ .Token }} instead of a link, so they work on any device
// or browser (a link only works in the browser that asked for it).

/** Which email the code came from: confirming a new account, a password-free sign-in, or a password reset. */
export type EmailCodeKind = 'signup' | 'email' | 'recovery';

const isRateLimited = (e: unknown) => {
  const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : '';
  return (e as { status?: number } | null)?.status === 429 || /rate limit|too many|security purposes|only request this after/i.test(msg);
};

/** Checks the code and signs the user in (for 'recovery', signed in just enough to set a new password). */
export async function verifyEmailCode(email: string, token: string, type: EmailCodeKind) {
  const { error } = await getSupabase().auth.verifyOtp({ email, token, type });
  if (error) throw error;
}

/** Sends a fresh code for the given purpose. */
export async function resendEmailCode(email: string, type: EmailCodeKind) {
  if (type === 'recovery') return requestPasswordReset(email);
  if (type === 'email') return sendEmailSignInCode(email);
  const { error } = await getSupabase().auth.resend({ type: 'signup', email });
  if (error && isRateLimited(error)) throw new Error('A code was sent moments ago. Wait a minute before asking for another.');
  if (error) throw error;
}

/**
 * Password-free sign-in: emails a 6-digit code to an existing account. Never creates an
 * account (sign-up collects the name and role), and answers the same for unknown emails.
 */
export async function sendEmailSignInCode(email: string) {
  const { error } = await getSupabase().auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
  if (!error) return;
  if (isRateLimited(error)) throw new Error('A code was sent moments ago. Wait a minute before asking for another.');
  // "Signups not allowed for otp" = no such account. Stay quiet about it.
  if (/signups? not allowed|user not found/i.test(error.message)) return;
  throw error;
}

/** Sets a new password for the user signed in through the reset link. */
export async function updatePassword(password: string) {
  const { error } = await getSupabase().auth.updateUser({ password });
  if (error) throw error;
}

/** Friendlier words for the auth errors students actually hit. */
export function authErrorMessage(e: unknown): string {
  const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : String(e ?? '');
  const status = (e as { status?: number } | null)?.status;
  if (status === 429 || /rate limit|too many requests|over_request_rate_limit/i.test(msg)) return 'Too many attempts. Wait a minute, then try again.';
  if (/invalid login credentials/i.test(msg)) return 'That email and password don’t match. Try again, or reset your password.';
  if (/email not confirmed/i.test(msg)) return 'Confirm your email first: enter the code we sent you.';
  if (/token has expired|otp_expired|invalid.*(token|otp)|(token|otp).*invalid/i.test(msg)) return 'That code is wrong or has expired. Check the latest email, or send a new code.';
  if (/same.*password|different from the old/i.test(msg)) return 'Choose a password different from your old one.';
  if (/weak|at least \d+ characters|password should/i.test(msg)) return 'Choose a stronger password: at least 8 characters.';
  return msg || 'Something went wrong. Please try again.';
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

/** Sends an SMS code. Creates the account on first use (student role, with the referral code if given). */
export async function sendPhoneOtp(phone: string, fullName?: string, referralCode?: string) {
  const { error } = await getSupabase().auth.signInWithOtp({
    phone,
    options: {
      shouldCreateUser: true,
      data: { signup_as: 'student', ...(fullName ? { full_name: fullName } : {}), ...(referralCode ? { referral_code: referralCode } : {}) },
    },
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
