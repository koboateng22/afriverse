import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import type { User } from '@supabase/supabase-js';
import { Lock, MailCheck } from 'lucide-react';
import { Button } from '../../components/Button/Button';
import { Field } from '../../components/Field/Field';
import { spring } from '../../lib/motion';
import { authErrorMessage, resendEmailCode, updatePassword, verifyEmailCode, type EmailCodeKind } from './api';
import { holdSignedInRedirect } from './redirectHold';

// Supabase allows one email per address about every 60 seconds.
const RESEND_COOLDOWN_S = 60;
const CODE_LENGTH = 6;

export type EmailCodeStepProps = {
  email: string;
  type: EmailCodeKind;
  /** Shown under the heading, above the code box. */
  intro?: ReactNode;
  /** Runs after a correct code (the session is already set). */
  onVerified?: () => void;
  /** "Use a different email": go back to the form. */
  onBack: () => void;
  backLabel?: string;
  /** How "Send a new code" sends it; defaults to resendEmailCode(email, type). */
  resend?: () => Promise<void>;
  /**
   * Sign-up: the password the student chose, saved once the code is verified (the code
   * proves they own the inbox). Kept only in memory, never in storage.
   */
  newPassword?: string;
  /** Runs right after the code is verified, before the password is saved. False = stop (the caller handled it). */
  checkUser?: (user: User | null) => boolean | Promise<boolean>;
};

const MIN_PASSWORD = 8;

/**
 * "Verify Code" step: the 6-digit code from the email. Works on any device, unlike the
 * old links, which only worked in the browser that asked for them.
 */
export function EmailCodeStep({
  email,
  type,
  intro,
  onVerified,
  onBack,
  backLabel = 'Use a different email',
  resend: sendAgain,
  newPassword,
  checkUser,
}: EmailCodeStepProps) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'verify' | 'resend' | 'password' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_S);
  const inFlight = useRef(false);
  // Signed in by the code, but saving the password failed: ask for one here.
  const [needPassword, setNeedPassword] = useState(false);
  const [retryPassword, setRetryPassword] = useState('');
  // Keeps <RedirectIfSignedIn> from leaving the page while the password is saved.
  const release = useRef<(() => void) | null>(null);
  const letGo = () => {
    release.current?.();
    release.current = null;
  };
  useEffect(() => letGo, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  const verify = async (token: string) => {
    if (inFlight.current) return;
    if (!new RegExp(`^\\d{${CODE_LENGTH}}$`).test(token)) {
      setError(`Enter the ${CODE_LENGTH}-digit code from the email.`);
      return;
    }
    inFlight.current = true;
    setBusy('verify');
    setError(null);
    setNotice(null);
    const holds = newPassword !== undefined || checkUser !== undefined;
    if (holds) release.current = holdSignedInRedirect();
    let user: User | null;
    try {
      user = await verifyEmailCode(email, token, type);
    } catch (e) {
      letGo();
      setError(authErrorMessage(e));
      setCode('');
      inFlight.current = false;
      setBusy(null);
      return;
    }
    try {
      if (checkUser && !(await checkUser(user))) return letGo();
      if (newPassword) await savePassword(newPassword);
      else finish();
    } catch (e) {
      letGo();
      setError(authErrorMessage(e));
    } finally {
      inFlight.current = false;
      setBusy((b) => (b === 'verify' ? null : b));
    }
  };

  const finish = () => {
    letGo();
    onVerified?.();
  };

  /** Sign-up's last step: the account exists and is signed in; give it the chosen password. */
  const savePassword = async (password: string) => {
    setBusy('password');
    setError(null);
    try {
      await updatePassword(password);
      finish();
    } catch (e) {
      setNeedPassword(true);
      setError(authErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void verify(code);
  };

  const resend = async () => {
    setBusy('resend');
    setError(null);
    setNotice(null);
    try {
      await (sendAgain ? sendAgain() : resendEmailCode(email, type));
      setNotice('A new code is on its way. Use the newest email; older codes stop working.');
      setCooldown(RESEND_COOLDOWN_S);
      setCode('');
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  if (needPassword) {
    return (
      <motion.div className="auth-code" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={spring}>
        <div className="auth-form__inbox" role="status">
          <MailCheck aria-hidden="true" />
          <h2>Email confirmed</h2>
          <p>Your account is ready, but we couldn’t save your password. Choose one to finish.</p>
        </div>
        <form
          className="auth-form__form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (retryPassword.length < MIN_PASSWORD) return setError(`Use at least ${MIN_PASSWORD} characters for your password.`);
            void savePassword(retryPassword);
          }}
        >
          <Field
            label="Password"
            type="password"
            autoComplete="new-password"
            icon={<Lock />}
            hint={`At least ${MIN_PASSWORD} characters.`}
            value={retryPassword}
            onChange={(e) => {
              setRetryPassword(e.target.value);
              setError(null);
            }}
            error={error}
            autoFocus
          />
          <Button type="submit" size="lg" block loading={busy === 'password'} disabled={!retryPassword}>
            Save password
          </Button>
          <div className="auth-code__actions">
            {/* Without one they can still sign in with an emailed code, or set it with "Forgot password?". */}
            <Button variant="quiet" onClick={finish} disabled={busy !== null}>
              Skip for now
            </Button>
          </div>
        </form>
      </motion.div>
    );
  }

  return (
    <motion.div className="auth-code" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={spring}>
      <div className="auth-form__inbox" role="status">
        <MailCheck aria-hidden="true" />
        <h2>Check your email</h2>
        <p>
          {intro ?? (
            <>
              We sent a {CODE_LENGTH}-digit code to <strong>{email}</strong>.
            </>
          )}{' '}
          You can open the email on any device. Not there after a minute? Check your spam or promotions folder.
        </p>
      </div>

      <form className="auth-form__form" onSubmit={onSubmit} noValidate>
        <Field
          label="Verification code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d*"
          maxLength={CODE_LENGTH}
          placeholder="000000"
          value={code}
          onChange={(e) => {
            const next = e.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH);
            setCode(next);
            setError(null);
            // Pasting or autofilling the whole code submits straight away.
            if (next.length === CODE_LENGTH) void verify(next);
          }}
          error={error}
          autoFocus
        />
        {notice && !error && <p className="auth-form__note" role="status">{notice}</p>}
        <Button type="submit" size="lg" block loading={busy === 'verify' || busy === 'password'} disabled={code.length !== CODE_LENGTH || busy !== null}>
          Verify code
        </Button>
        <div className="auth-code__actions">
          <Button variant="quiet" onClick={() => void resend()} loading={busy === 'resend'} disabled={cooldown > 0 || busy !== null}>
            {cooldown > 0 ? `Send a new code in ${cooldown}s` : 'Send a new code'}
          </Button>
          <Button variant="quiet" onClick={onBack} disabled={busy === 'verify' || busy === 'password'}>
            {backLabel}
          </Button>
        </div>
      </form>
    </motion.div>
  );
}
