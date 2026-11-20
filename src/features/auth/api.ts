import type { User } from '@supabase/supabase-js';
import { getSupabase } from '../../lib/supabase';

const callbackUrl = () => `${window.location.origin}/auth/callback`;

export type SignupAs = 'student' | 'mentor';

export type MentorApplication = { expertise: string; rate_cents: number; linkedin_url: string };

export type SignupInput = {
  email: string;
  fullName: string;
  as: SignupAs;
  referralCode?: string;
  mentorApplication?: MentorApplication;
};

/**
 * Sign-up, step 1: email a 6-digit code. This is signInWithOtp (shouldCreateUser), not
 * signUp(): the account is created now, but with no usable password and no link. The
 * code is checked with verifyOtp({ type: 'email' }), and the password the student chose is
 * saved after that (setPassword), once the code has proved they own the inbox.
 *
 * Which email Supabase sends: a new (or never-confirmed) address gets the "Confirm signup"
 * template; an address that already has an account gets the "Magic Link" template. Both
 * must use {{ .Token }} — the template, not this call, decides whether it's a code or a link.
 */
export async function sendSignupCode(input: SignupInput) {
  const { error } = await getSupabase().auth.signInWithOtp({
    email: input.email,
    options: {
      shouldCreateUser: true,
      // Saved on the new user only (Supabase ignores it for an existing account). Read by the
      // handle_new_user trigger: `signup_as` is 'student' or 'mentor' (mentors start pending;
      // admin can't be requested); referral_code is kept only if live (0018);
      // mentor_application goes to mentor_applications (0021).
      data: {
        full_name: input.fullName,
        signup_as: input.as,
        ...(input.referralCode ? { referral_code: input.referralCode } : {}),
        ...(input.mentorApplication ? { mentor_application: input.mentorApplication } : {}),
      },
    },
  });
  if (!error) return;
  if (isRateLimited(error)) throw new Error('A code was sent moments ago. Wait a minute before asking for another.');
  throw error;
}

/**
 * Mentor sign-up: true when the verified account really is a mentor applicant. False means
 * the email already had a student (or Google) account, so no application was saved.
 */
export const isMentorApplicant = (user: User | null) => user?.user_metadata?.signup_as === 'mentor';

/** Sends the 6-digit reset code. Always "succeeds" to the caller, so nobody can probe which emails have accounts. */
export async function requestPasswordReset(email: string) {
  // No redirectTo: the Reset Password email carries the code, not a link.
  const { error } = await getSupabase().auth.resetPasswordForEmail(email);
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

/**
 * Checks the code and signs the user in (for 'recovery', signed in just enough to set a new
 * password). 'email' accepts both a sign-up code and a sign-in code.
 */
export async function verifyEmailCode(email: string, token: string, type: EmailCodeKind): Promise<User | null> {
  const { data, error } = await getSupabase().auth.verifyOtp({ email, token, type });
  if (error) throw error;
  return data.user;
}

/** Sends a fresh code for the given purpose. */
export async function resendEmailCode(email: string, type: EmailCodeKind) {
  if (type === 'recovery') return requestPasswordReset(email);
  if (type === 'email') return sendEmailSignInCode(email, { createStudent: true });
  const { error } = await getSupabase().auth.resend({ type: 'signup', email });
  if (error && isRateLimited(error)) throw new Error('A code was sent moments ago. Wait a minute before asking for another.');
  if (error) throw error;
}

/**
 * Password-free sign-in with a 6-digit email code. For students it also signs up
 * (shouldCreateUser: true): a new email gets a free student account, and onboarding asks
 * for the name. Mentors must apply first, so for them it never creates an account and
 * answers the same for unknown emails.
 */
export async function sendEmailSignInCode(email: string, opts: { createStudent: boolean } = { createStudent: true }) {
  const { error } = await getSupabase().auth.signInWithOtp({
    email,
    options: opts.createStudent ? { shouldCreateUser: true, data: { signup_as: 'student' } } : { shouldCreateUser: false },
  });
  if (!error) return;
  if (isRateLimited(error)) throw new Error('A code was sent moments ago. Wait a minute before asking for another.');
  // "Signups not allowed for otp" = no such account (mentor sign-in). Stay quiet about it.
  if (!opts.createStudent && /signups? not allowed|user not found/i.test(error.message)) return;
  throw error;
}

/**
 * Sets the signed-in user's password: after a reset code, or right after a sign-up code.
 * Supabase stores only a bcrypt hash; the app never keeps the password anywhere but memory.
 */
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

export async function signOut() {
  const { error } = await getSupabase().auth.signOut();
  if (error) throw error;
}
