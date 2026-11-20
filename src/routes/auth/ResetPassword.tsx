import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Mail } from 'lucide-react';
import { AuthLayout } from '../../features/auth/AuthLayout';
import { authErrorMessage, requestPasswordReset } from '../../features/auth/api';
import { EmailCodeStep } from '../../features/auth/EmailCodeStep';
import { Button } from '../../components/Button/Button';
import { Field } from '../../components/Field/Field';
import { useToast } from '../../components/Toast/Toast';
import '../../features/auth/AuthForm.css';

/**
 * /reset-password: emails an 8-digit reset code, then asks for it here. A correct code signs the
 * user in for the reset and /update-password sets the new password. The answer is the same
 * whether or not the email has an account.
 */
export default function ResetPassword() {
  const location = useLocation();
  const navigate = useNavigate();
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
      toast.success('Check your inbox for the reset code.');
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
      lede={sentTo ? 'Enter the code from the email, then choose a new password.' : 'Enter your email and we’ll send you an 8-digit code to choose a new password.'}
      footer={
        <p>
          Remembered it? <Link to="/login">Sign in</Link>
        </p>
      }
    >
      {sentTo ? (
        <EmailCodeStep
          email={sentTo}
          type="recovery"
          intro={
            <>
              If <strong>{sentTo}</strong> has an Afriversity account, an 8-digit reset code is on its way.
            </>
          }
          onVerified={() => navigate('/update-password', { replace: true })}
          onBack={() => setSentTo(null)}
        />
      ) : (
        <form className="auth-form auth-form__form" onSubmit={submit} noValidate>
          <Field label="Email" type="email" inputMode="email" autoComplete="email" icon={<Mail />} value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Button type="submit" size="lg" block loading={busy} disabled={!email.trim()}>
            Send reset code
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
