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
  // No emailRedirectTo: the confirmation email carries a 6-digit code ({{ .Token }}),
  // entered on the "Verify Code" screen, so nothing depends on a link or the browser.
  const { data, error } = await getSupabase().auth.signUp({
    email: input.email,
    password: input.password,
    options: {
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

/** Checks the code and signs the user in (for 'recovery', signed in just enough to set a new password). */
export async function verifyEmailCode(email: string, token: string, type: EmailCodeKind) {
  const { error } = await getSupabase().auth.verifyOtp({ email, token, type });
  if (error) throw error;
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
