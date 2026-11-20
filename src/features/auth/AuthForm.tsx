import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Gift, KeyRound, Lock, Mail, UserRound } from 'lucide-react';
import { Button } from '../../components/Button/Button';
import { Field } from '../../components/Field/Field';
import { normalizeCode, referralCodeValid, rememberReferral } from '../ambassador/api';
import {
  authErrorMessage,
  isMentorApplicant,
  resendEmailCode,
  sendEmailSignInCode,
  sendSignupCode,
  signInWithEmail,
  signInWithGoogle,
  signOut,
  type SignupAs,
} from './api';
import { EmailCodeStep } from './EmailCodeStep';
import './AuthForm.css';

export type AuthFormProps = {
  mode: 'signup' | 'login';
  audience: SignupAs;
};

type CodeCheck = 'idle' | 'checking' | 'valid' | 'invalid';
/** The "Verify Code" step: which email the code went to, and what it's for. */
type Verify = { email: string; type: 'signup' | 'email'; intro?: ReactNode; resend?: () => Promise<void>; signup?: boolean };

// Client-side brake on repeated failed sign-ins (Supabase's own rate limit is the real guard).
const MAX_FAILED_SIGNINS = 5;
const FAILED_WINDOW_MS = 60_000;

/** ?ref=CHRIS10 from an ambassador's shared link. */
const codeFromUrl = () => normalizeCode(new URLSearchParams(window.location.search).get('ref') ?? '');

function GoogleGlyph() {
  // Brand mark drawn with currentColor to stay inside the token palette.
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M21.6 12.23c0-.68-.06-1.36-.18-2.02H12v3.83h5.39a4.6 4.6 0 0 1-2 3.02v2.5h3.23c1.9-1.75 2.98-4.32 2.98-7.33ZM12 22c2.7 0 4.97-.9 6.62-2.43l-3.23-2.5c-.9.6-2.05.95-3.39.95-2.6 0-4.81-1.76-5.6-4.12H3.07v2.58A10 10 0 0 0 12 22Zm-5.6-8.1a6 6 0 0 1 0-3.8V7.52H3.07a10 10 0 0 0 0 8.96L6.4 13.9ZM12 5.98c1.47 0 2.79.5 3.83 1.5l2.86-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.93 5.52L6.4 10.1C7.19 7.74 9.4 5.98 12 5.98Z"
      />
    </svg>
  );
}

export function AuthForm({ mode, audience }: AuthFormProps) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [emailTaken, setEmailTaken] = useState(false);
  const failures = useRef<number[]>([]);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState<'submit' | 'google' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verify, setVerify] = useState<Verify | null>(null);
  // Login only: sign in with an emailed code instead of a password.
  const [withCode, setWithCode] = useState(false);
  const [referral, setReferral] = useState(codeFromUrl);
  const [codeCheck, setCodeCheck] = useState<CodeCheck>('idle');

  const isSignup = mode === 'signup';
  const allowGoogle = audience === 'student';
  const askReferral = isSignup && audience === 'student';
  const signInPath = audience === 'mentor' ? '/mentor/login' : '/login';
  const mismatch = isSignup && confirm.length > 0 && confirm !== password;
  const lockLeft = Math.max(0, Math.ceil((lockedUntil - now) / 1000));

  // Count down a sign-in lock, then release it.
  useEffect(() => {
    if (!lockedUntil) return;
    const t = window.setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= lockedUntil) setLockedUntil(0);
    }, 1000);
    return () => window.clearInterval(t);
  }, [lockedUntil]);

  const noteFailedSignIn = () => {
    const t = Date.now();
    failures.current = [...failures.current.filter((x) => t - x < FAILED_WINDOW_MS), t];
    if (failures.current.length >= MAX_FAILED_SIGNINS) {
      setNow(t);
      setLockedUntil(failures.current[0] + FAILED_WINDOW_MS);
    }
  };

  /** The code to send, or '' for none. Throws for a code that doesn't exist, so nobody signs up thinking it counted. */
  const checkedReferral = async (): Promise<string> => {
    const code = normalizeCode(referral);
    if (!askReferral || !code) return '';
    if (codeCheck === 'valid') return code;
    setCodeCheck('checking');
    let ok: boolean;
    try {
      ok = await referralCodeValid(code);
    } catch {
      setCodeCheck('idle');
      return code; // couldn't check: send it anyway, the server ignores unknown codes
    }
    setCodeCheck(ok ? 'valid' : 'invalid');
    if (!ok) throw new Error(`We couldn't find the referral code ${code}. Check it with your ambassador, or clear the box to continue.`);
    return code;
  };

  const referralField = askReferral && (
    <Field
      label="Have a referral code?"
      icon={<Gift />}
      placeholder="e.g. CHRIS10"
      autoCapitalize="characters"
      autoComplete="off"
      spellCheck={false}
      maxLength={16}
      value={referral}
      onChange={(e) => {
        setReferral(normalizeCode(e.target.value));
        setCodeCheck('idle');
      }}
      onBlur={() => void checkedReferral().catch(() => {})}
      hint={codeCheck === 'valid' ? 'Code applied. Thanks for joining through a Campus Ambassador.' : codeCheck === 'checking' ? 'Checking code…' : 'Optional. From a Campus Ambassador.'}
      error={codeCheck === 'invalid' ? "That code doesn't exist. Check it, or leave the box empty." : null}
    />
  );

  const run = async (kind: 'submit' | 'google', fn: () => Promise<void>) => {
    setError(null);
    setEmailTaken(false);
    setBusy(kind);
    try {
      await fn();
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  // Successful sign-in flips the AuthProvider session; the route-level
  // <RedirectIfSignedIn> then sends the user to the right place.
  const onEmailSubmit = (e: FormEvent) => {
    e.preventDefault();
    run('submit', async () => {
      if (isSignup) {
        if (password.length < 8) throw new Error('Use at least 8 characters for your password.');
        if (password !== confirm) throw new Error('The passwords don’t match. Type the same password twice.');
        const referralCode = await checkedReferral();
        // Email → "Send code" → 6-digit code → verifyOtp({ type: 'email' }) → the password is saved.
        const input = { email: email.trim(), fullName: fullName.trim(), as: audience, referralCode };
        await sendSignupCode(input);
        setVerify({
          email: input.email,
          type: 'email',
          signup: true,
          resend: () => sendSignupCode(input),
          intro: (
            <>
              We sent a 6-digit code to <strong>{input.email}</strong>. Enter it to confirm your email
              {audience === 'mentor' ? '; then the team reviews your mentor application.' : ' and continue to onboarding.'}
            </>
          ),
        });
      } else if (withCode) {
        if (!/^\S+@\S+\.\S+$/.test(email.trim())) throw new Error('Enter the email address you signed up with.');
        // Students: a new email gets a free account (shouldCreateUser). Mentors must apply first.
        await sendEmailSignInCode(email.trim(), { createStudent: audience === 'student' });
        setVerify({
          email: email.trim(),
          type: 'email',
          intro:
            audience === 'student' ? (
              <>
                We sent a 6-digit code to <strong>{email.trim()}</strong>. New to Afriversity? The code also creates your free account.
              </>
            ) : (
              <>
                If <strong>{email.trim()}</strong> has a mentor account, a 6-digit sign-in code is on its way.
              </>
            ),
        });
      } else {
        if (lockedUntil > Date.now()) throw new Error(`Too many attempts. Try again in ${lockLeft} seconds.`);
        try {
          await signInWithEmail(email.trim(), password);
          failures.current = [];
        } catch (err) {
          // Signed up but never confirmed: send a fresh code and ask for it here.
          if (/email not confirmed/i.test(String((err as { message?: unknown } | null)?.message ?? ''))) {
            await resendEmailCode(email.trim(), 'signup').catch(() => {}); // a recent code may still be valid
            setVerify({
              email: email.trim(),
              type: 'signup',
              intro: (
                <>
                  Your email isn’t confirmed yet. We sent a 6-digit code to <strong>{email.trim()}</strong>.
                </>
              ),
            });
            return;
          }
          noteFailedSignIn();
          throw err;
        }
      }
    });
  };

  if (verify) {
    return (
      <EmailCodeStep
        email={verify.email}
        type={verify.type}
        intro={verify.intro}
        onBack={() => setVerify(null)}
        // A mentor's "send a new code" must never create a student account.
        resend={verify.resend ?? (verify.type === 'email' && audience !== 'student' ? () => sendEmailSignInCode(verify.email, { createStudent: false }) : undefined)}
        newPassword={verify.signup ? password : undefined}
        // Mentor sign-up on an email that already has a student account: nothing was applied for.
        checkUser={
          verify.signup && audience === 'mentor'
            ? async (user) => {
                if (isMentorApplicant(user)) return true;
                await signOut();
                setVerify(null);
                setEmailTaken(true);
                return false;
              }
            : undefined
        }
      />
    );
  }

  return (
    <div className="auth-form">
      {/* Email + password (or an emailed code), and Google. Phone sign-in was removed. */}
      <motion.form
        className="auth-form__form"
        onSubmit={onEmailSubmit}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.18 }}
        noValidate
      >
        {isSignup && (
          <Field label="Full name" autoComplete="name" icon={<UserRound />} value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        )}
        <Field label="Email" type="email" inputMode="email" autoComplete="email" icon={<Mail />} value={email} onChange={(e) => setEmail(e.target.value)} required />
        {!withCode && (
          <Field
            label="Password"
            type="password"
            autoComplete={isSignup ? 'new-password' : 'current-password'}
            icon={<Lock />}
            hint={isSignup ? 'At least 8 characters.' : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        )}
        {isSignup ? (
          <Field
            label="Confirm password"
            type="password"
            autoComplete="new-password"
            icon={<KeyRound />}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            error={mismatch ? 'The passwords don’t match.' : null}
            hint={confirm && !mismatch ? 'Passwords match.' : undefined}
            required
          />
        ) : withCode ? (
          <p className="auth-form__note">We’ll email you a 6-digit code. No password needed.</p>
        ) : (
          <Link to="/reset-password" state={{ email: email.trim() }} className="auth-form__forgot">
            Forgot password?
          </Link>
        )}
        {referralField}
        {emailTaken && (
          <p className="auth-form__error" role="alert">
            This email is already registered. Please <Link to={signInPath}>sign in instead</Link>.
          </p>
        )}
        {error && <p className="auth-form__error" role="alert">{error}</p>}
        <Button
          type="submit"
          size="lg"
          block
          loading={busy === 'submit'}
          disabled={!email || (!withCode && !password) || (isSignup && (!fullName.trim() || !confirm || mismatch)) || (!withCode && lockLeft > 0)}
        >
          {isSignup
            ? audience === 'mentor'
              ? 'Apply as a mentor'
              : 'Send code'
            : withCode
              ? 'Email me a code'
              : lockLeft > 0
                ? `Try again in ${lockLeft}s`
                : 'Sign in'}
        </Button>
        {!isSignup && (
          <button
            type="button"
            className="auth-form__switch"
            onClick={() => {
              setWithCode((v) => !v);
              setError(null);
            }}
          >
            {withCode ? 'Sign in with your password instead' : 'Sign in with an email code instead'}
          </button>
        )}
      </motion.form>

      {allowGoogle && (
        <>
          <div className="auth-form__or" aria-hidden="true">
            <span>or</span>
          </div>
          <Button variant="secondary" size="lg" block icon={<GoogleGlyph />} loading={busy === 'google'} onClick={() =>
              run('google', async () => {
                // Google leaves the site before the account exists: keep the code to claim on return.
                if (askReferral) rememberReferral(await checkedReferral());
                await signInWithGoogle();
              })
            }>
            Continue with Google
          </Button>
        </>
      )}
    </div>
  );
}
