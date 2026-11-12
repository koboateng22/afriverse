import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Building2, CheckCircle2, Gift, Phone, UserRound } from 'lucide-react';
import { AuthLayout } from '../../features/auth/AuthLayout';
import { useAuth } from '../../features/auth/useAuth';
import { applyAmbassador } from '../../features/ambassador/api';
import { toE164 } from '../../features/auth/api';
import { Button } from '../../components/Button/Button';
import { Field, TextAreaField } from '../../components/Field/Field';
import { FullscreenLoader } from '../../components/FullscreenLoader/FullscreenLoader';
import { useToast } from '../../components/Toast/Toast';
import { errorMessage } from '../../lib/supabase';
import { spring } from '../../lib/motion';
import '../../features/auth/AuthForm.css';

const SUCCESS = 'Application received! We will contact you on WhatsApp soon.';
const WHY_MIN = 20;
const WHY_MAX = 1000;

function Done({ text }: { text: string }) {
  return (
    <motion.div className="auth-form__inbox" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={spring} role="status">
      <CheckCircle2 aria-hidden="true" />
      <h2>{text}</h2>
      <p>The team reviews applications every week. Keep using Afriversity as normal while you wait.</p>
      <Link className="btn" data-variant="secondary" to="/home">
        Back to Afriversity
      </Link>
    </motion.div>
  );
}

/** /ambassador-apply — a student applies to be a Campus Ambassador (admins review in Admin → Ambassadors). */
export default function AmbassadorApply() {
  const { loading, session, profile, refreshProfile } = useAuth();
  const toast = useToast();
  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [university, setUniversity] = useState('');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [why, setWhy] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  // The profile can arrive after the first render: prefill what the student hasn't typed.
  useEffect(() => {
    if (!profile) return;
    setFullName((v) => v || profile.full_name || '');
    setPhone((v) => v || profile.phone || '');
  }, [profile]);

  if (loading) return <FullscreenLoader label="Loading" />;

  const intro = 'Share Afriversity on your campus and earn GH₵ 5 every time a student you invited goes Pro. Paid by MoMo every month.';

  // Signed out: explain, then come back here after signing in or up.
  if (!session || !profile) {
    return (
      <AuthLayout eyebrow="Campus Ambassadors" title="Apply to be a Campus Ambassador" lede={intro}>
        <div className="auth-form auth-form__form">
          <p className="auth-form__note">You need a free student account to apply.</p>
          <Link className="btn" data-variant="gold" data-size="lg" to="/signup" state={{ from: '/ambassador-apply' }}>
            Create a student account
          </Link>
          <Link className="btn" data-variant="secondary" data-size="lg" to="/login" state={{ from: '/ambassador-apply' }}>
            I already have an account
          </Link>
        </div>
      </AuthLayout>
    );
  }

  if (done || profile.role === 'pending_ambassador') {
    return (
      <AuthLayout eyebrow="Campus Ambassadors" title="You’ve applied">
        <Done text={SUCCESS} />
      </AuthLayout>
    );
  }
  if (profile.role === 'ambassador') {
    return (
      <AuthLayout eyebrow="Campus Ambassadors" title="You’re already an ambassador">
        <Link className="btn" data-variant="gold" data-size="lg" to="/ambassador">
          Open your Ambassador Hub
        </Link>
      </AuthLayout>
    );
  }
  if (profile.role !== 'student') {
    return (
      <AuthLayout eyebrow="Campus Ambassadors" title="For student accounts" lede="Campus Ambassadors are students. Sign in with your student account to apply.">
        <Link className="btn" data-variant="secondary" to="/">
          Back
        </Link>
      </AuthLayout>
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const e164 = toE164(phone);
    if (fullName.trim().length < 2) return toast.error('Enter your full name.');
    if (university.trim().length < 2) return toast.error('Enter your university or school.');
    if (!/^\+\d{9,15}$/.test(e164)) return toast.error('Enter your WhatsApp number, e.g. 055 123 4987 or +233 55 123 4987.');
    if (why.trim().length < WHY_MIN) return toast.error(`Tell us a little more about why you want to join (at least ${WHY_MIN} characters).`);
    setBusy(true);
    try {
      await applyAmbassador({ fullName: fullName.trim(), university: university.trim(), phone: e164, why: why.trim() });
      await refreshProfile();
      setDone(true);
      toast.success(SUCCESS);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout eyebrow="Campus Ambassadors" title="Apply to be a Campus Ambassador" lede={intro}>
      <form className="auth-form auth-form__form" onSubmit={submit} noValidate>
        <Field label="Full name" autoComplete="name" icon={<UserRound />} value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={120} required />
        <Field label="University or school" icon={<Building2 />} placeholder="e.g. KNUST" value={university} onChange={(e) => setUniversity(e.target.value)} maxLength={160} required />
        <Field
          label="WhatsApp number"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          icon={<Phone />}
          hint="We’ll contact you here. Ghana numbers can start with 0."
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
        />
        <TextAreaField
          label="Why do you want to join?"
          rows={4}
          maxLength={WHY_MAX}
          value={why}
          onChange={(e) => setWhy(e.target.value)}
          hint={`${why.trim().length}/${WHY_MAX} · at least ${WHY_MIN} characters`}
          required
        />
        <Button type="submit" variant="gold" size="lg" block loading={busy} icon={<Gift aria-hidden="true" />}>
          Send my application
        </Button>
      </form>
    </AuthLayout>
  );
}
