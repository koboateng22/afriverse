import { useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail, MailCheck } from 'lucide-react';
import { AuthLayout } from '../../features/auth/AuthLayout';
import { authErrorMessage, requestPasswordReset } from '../../features/auth/api';
import { Button } from '../../components/Button/Button';
import { Field } from '../../components/Field/Field';
import { useToast } from '../../components/Toast/Toast';
import { spring } from '../../lib/motion';
import '../../features/auth/AuthForm.css';

/** /reset-password — sends the reset link. The answer is the same whether or not the email has an account. */
export default function ResetPassword() {
  const location = useLocation();
  const toast = useToast();
  const [email, setEmail] = useState(() => ((location.state as { email?: string } | null)?.email ?? '').trim());
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const address = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(address)) return toast.error('Enter the email address you signed up with.');
    setBusy(true);
    try {
      await requestPasswordReset(address);
      setSentTo(address);
      toast.success('Check your inbox for the reset link.');
    } catch (err) {
      toast.error(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      eyebrow="Account help"
      title="Reset your password"
      lede="Enter your email and we’ll send you a link to choose a new password."
      footer={
        <p>
          Remembered it? <Link to="/login">Sign in</Link>
        </p>
      }
    >
      {sentTo ? (
        <motion.div className="auth-form__inbox" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={spring} role="status">
          <MailCheck aria-hidden="true" />
          <h2>Check your inbox</h2>
          <p>
            If <strong>{sentTo}</strong> has an Afriversity account, a reset link is on its way. Open it on this device. It can take a few minutes; check spam too.
          </p>
          <Button variant="quiet" onClick={() => setSentTo(null)}>
            Use a different email
          </Button>
        </motion.div>
      ) : (
        <form className="auth-form auth-form__form" onSubmit={submit} noValidate>
          <Field label="Email" type="email" inputMode="email" autoComplete="email" icon={<Mail />} value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Button type="submit" size="lg" block loading={busy} disabled={!email.trim()}>
            Send reset link
          </Button>
          <p className="auth-form__note">Signed up with your phone number? Sign in with an SMS code instead; there’s no password to reset.</p>
        </form>
      )}
    </AuthLayout>
  );
}
