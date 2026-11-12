import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { KeyRound, Lock } from 'lucide-react';
import { AuthLayout } from '../../features/auth/AuthLayout';
import { authErrorMessage, updatePassword } from '../../features/auth/api';
import { homeFor, useAuth } from '../../features/auth/useAuth';
import { Button } from '../../components/Button/Button';
import { Field } from '../../components/Field/Field';
import { FullscreenLoader } from '../../components/FullscreenLoader/FullscreenLoader';
import { useToast } from '../../components/Toast/Toast';
import '../../features/auth/AuthForm.css';

// The reset link signs the user in (Supabase exchanges the code in the URL); give it a moment.
const LINK_WAIT_MS = 8000;

/** /update-password — where the reset email lands: choose a new password, then go home. */
export default function UpdatePassword() {
  const { session, profile, loading } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [expired, setExpired] = useState(() => {
    const params = new URLSearchParams(window.location.search + window.location.hash.replace('#', '&'));
    return Boolean(params.get('error_description'));
  });
  const mismatch = confirm.length > 0 && confirm !== password;

  useEffect(() => {
    if (session || expired) return;
    const t = window.setTimeout(() => setExpired(true), LINK_WAIT_MS);
    return () => window.clearTimeout(t);
  }, [session, expired]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return toast.error('Use at least 8 characters for your new password.');
    if (password !== confirm) return toast.error('The passwords don’t match. Type the same password twice.');
    setBusy(true);
    try {
      await updatePassword(password);
      toast.success('Password updated. You’re signed in.');
      navigate(profile ? homeFor(profile) : '/home', { replace: true });
    } catch (err) {
      toast.error(authErrorMessage(err));
      setBusy(false);
    }
  };

  if (!session && !expired) return <FullscreenLoader label="Opening your reset link" />;

  return (
    <AuthLayout
      eyebrow="Account help"
      title={session ? 'Choose a new password' : 'This link has expired'}
      lede={session ? 'Use at least 8 characters. You’ll stay signed in on this device.' : 'Reset links work once and expire after a while. Ask for a new one.'}
      footer={
        <p>
          <Link to="/login">Back to sign in</Link>
        </p>
      }
    >
      {session ? (
        <form className="auth-form auth-form__form" onSubmit={submit} noValidate>
          <Field label="New password" type="password" autoComplete="new-password" icon={<Lock />} hint="At least 8 characters." value={password} onChange={(e) => setPassword(e.target.value)} required />
          <Field
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
            icon={<KeyRound />}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            error={mismatch ? 'The passwords don’t match.' : null}
            required
          />
          <Button type="submit" size="lg" block loading={busy || loading} disabled={!password || !confirm || mismatch}>
            Save new password
          </Button>
        </form>
      ) : (
        <Button size="lg" block onClick={() => navigate('/reset-password')}>
          Send a new reset link
        </Button>
      )}
    </AuthLayout>
  );
}
