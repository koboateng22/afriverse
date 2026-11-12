import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Gift, KeyRound, Lock, Mail, MailCheck, Phone, UserRound } from 'lucide-react';
import { Button } from '../../components/Button/Button';
import { Field } from '../../components/Field/Field';
import { spring } from '../../lib/motion';
import { normalizeCode, referralCodeValid, rememberReferral } from '../ambassador/api';
import { authErrorMessage, EmailTakenError, sendPhoneOtp, signInWithEmail, signInWithGoogle, signUpWithEmail, toE164, verifyPhoneOtp, type SignupAs } from './api';
import './AuthForm.css';

export type AuthFormProps = {
  mode: 'signup' | 'login';
  audience: SignupAs;
};

type Method = 'email' | 'phone';
type CodeCheck = 'idle' | 'checking' | 'valid' | 'invalid';

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
  const [method, setMethod] = useState<Method>('email');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [emailTaken, setEmailTaken] = useState(false);
  const failures = useRef<number[]>([]);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSentTo, setOtpSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState<'submit' | 'google' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkInbox, setCheckInbox] = useState<string | null>(null);
  const [referral, setReferral] = useState(codeFromUrl);
  const [codeCheck, setCodeCheck] = useState<CodeCheck>('idle');

  const isSignup = mode === 'signup';
  const allowPhone = audience === 'student';
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
      if (e instanceof EmailTakenError) setEmailTaken(true);
      else setError(authErrorMessage(e));
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
        const { needsConfirmation } = await signUpWithEmail({ email: email.trim(), password, fullName: fullName.trim(), as: audience, referralCode });
        if (needsConfirmation) setCheckInbox(email.trim());
      } else {
        if (lockedUntil > Date.now()) throw new Error(`Too many attempts. Try again in ${lockLeft} seconds.`);
        try {
          await signInWithEmail(email.trim(), password);
          failures.current = [];
        } catch (err) {
          noteFailedSignIn();
          throw err;
        }
      }
    });
  };

  const onPhoneSubmit = (e: FormEvent) => {
    e.preventDefault();
    run('submit', async () => {
      if (!otpSentTo) {
        const e164 = toE164(phone);
        if (!/^\+\d{9,15}$/.test(e164)) throw new Error('Enter a valid phone number, e.g. 055 123 4987 or +233 55 123 4987.');
        const referralCode = isSignup ? await checkedReferral() : '';
        await sendPhoneOtp(e164, isSignup ? fullName.trim() : undefined, referralCode);
        setOtpSentTo(e164);
      } else {
        if (!/^\d{6}$/.test(otp.trim())) throw new Error('Enter the 6-digit code from the SMS.');
        await verifyPhoneOtp(otpSentTo, otp.trim());
      }
    });
  };

  if (checkInbox) {
    return (
      <motion.div className="auth-form__inbox" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={spring} role="status">
        <MailCheck aria-hidden="true" />
        <h2>Check your inbox</h2>
        <p>
          We sent a confirmation link to <strong>{checkInbox}</strong>. Open it on this device to continue
          {audience === 'mentor' ? ' — your mentor application will then be reviewed.' : ' to onboarding.'}
        </p>
      </motion.div>
    );
  }

  return (
    <div className="auth-form">
      {allowPhone && (
        <div className="auth-form__tabs" role="tablist" aria-label="Sign-in method">
          {(['email', 'phone'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={method === m}
              className="auth-form__tab"
              onClick={() => {
                setMethod(m);
                setError(null);
              }}
            >
              {method === m && <span className="auth-form__tab-pill" />}
              <span className="auth-form__tab-label">{m === 'email' ? 'Email' : 'Phone'}</span>
            </button>
          ))}
        </div>
      )}

      <AnimatePresence mode="wait" initial={false}>
        {method === 'email' ? (
          <motion.form
            key="email"
            className="auth-form__form"
            onSubmit={onEmailSubmit}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12 }}
            transition={{ duration: 0.18 }}
            noValidate
          >
            {isSignup && (
              <Field label="Full name" autoComplete="name" icon={<UserRound />} value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            )}
            <Field label="Email" type="email" inputMode="email" autoComplete="email" icon={<Mail />} value={email} onChange={(e) => setEmail(e.target.value)} required />
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
              disabled={!email || !password || (isSignup && (!fullName.trim() || !confirm || mismatch)) || lockLeft > 0}
            >
              {isSignup ? (audience === 'mentor' ? 'Apply as a mentor' : 'Create account') : lockLeft > 0 ? `Try again in ${lockLeft}s` : 'Sign in'}
            </Button>
          </motion.form>
        ) : (
          <motion.form
            key="phone"
            className="auth-form__form"
            onSubmit={onPhoneSubmit}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.18 }}
            noValidate
          >
            {isSignup && !otpSentTo && (
              <Field label="Full name" autoComplete="name" icon={<UserRound />} value={fullName} onChange={(e) => setFullName(e.target.value)} />
            )}
            {!otpSentTo ? (
              <Field
                label="Phone number"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                icon={<Phone />}
                hint="Ghana numbers can start with 0. Other countries: include +code."
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            ) : (
              <Field
                label={`6-digit code sent to ${otpSentTo}`}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                autoFocus
              />
            )}
            {!otpSentTo && referralField}
            {error && <p className="auth-form__error" role="alert">{error}</p>}
            <Button type="submit" size="lg" block loading={busy === 'submit'} disabled={!otpSentTo ? !phone : otp.length !== 6}>
              {otpSentTo ? 'Verify code' : 'Send code'}
            </Button>
            {otpSentTo && (
              <Button variant="quiet" onClick={() => { setOtpSentTo(null); setOtp(''); }}>
                Use a different number
              </Button>
            )}
          </motion.form>
        )}
      </AnimatePresence>

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
