import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { MailCheck } from 'lucide-react';
import { Button } from '../../components/Button/Button';
import { Field } from '../../components/Field/Field';
import { spring } from '../../lib/motion';
import { authErrorMessage, resendEmailCode, verifyEmailCode, type EmailCodeKind } from './api';

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
};

/**
 * "Verify Code" step: the 6-digit code from the email. Works on any device, unlike the
 * old links, which only worked in the browser that asked for them.
 */
export function EmailCodeStep({ email, type, intro, onVerified, onBack, backLabel = 'Use a different email' }: EmailCodeStepProps) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'verify' | 'resend' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_S);
  const inFlight = useRef(false);

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
    try {
      await verifyEmailCode(email, token, type);
      onVerified?.();
    } catch (e) {
      setError(authErrorMessage(e));
      setCode('');
    } finally {
      inFlight.current = false;
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
      await resendEmailCode(email, type);
      setNotice('A new code is on its way. Use the newest email; older codes stop working.');
      setCooldown(RESEND_COOLDOWN_S);
      setCode('');
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

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
        <Button type="submit" size="lg" block loading={busy === 'verify'} disabled={code.length !== CODE_LENGTH || busy !== null}>
          Verify code
        </Button>
        <div className="auth-code__actions">
          <Button variant="quiet" onClick={() => void resend()} loading={busy === 'resend'} disabled={cooldown > 0 || busy !== null}>
            {cooldown > 0 ? `Send a new code in ${cooldown}s` : 'Send a new code'}
          </Button>
          <Button variant="quiet" onClick={onBack} disabled={busy === 'verify'}>
            {backLabel}
          </Button>
        </div>
      </form>
    </motion.div>
  );
}
