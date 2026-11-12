import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Briefcase, Coins, KeyRound, Link2, Lock, Mail, MailCheck, UserRound } from 'lucide-react';
import { AuthLayout } from '../../features/auth/AuthLayout';
import { RedirectIfSignedIn } from '../../features/auth/RedirectIfSignedIn';
import { authErrorMessage, EmailTakenError, signUpWithEmail } from '../../features/auth/api';
import { Button } from '../../components/Button/Button';
import { Field } from '../../components/Field/Field';
import { useToast } from '../../components/Toast/Toast';
import { formatMoney, toCents } from '../../lib/money';
import { spring } from '../../lib/motion';
import '../../features/auth/AuthForm.css';

// Same range as mentors.proposed_rate_cents (0010): GHS 10 – 100,000.
const MIN_RATE = 1000;
const MAX_RATE = 10_000_000;
const LINKEDIN = /^https:\/\/([a-z]{2,3}\.)?linkedin\.com\/\S+$/i;

/** /mentor-apply — creates a mentor account plus its application; admins review in Admin → Mentors. */
export default function MentorApply() {
  const toast = useToast();
  const [f, setF] = useState({ name: '', email: '', password: '', confirm: '', expertise: '', rate: '', linkedin: '' });
  const [busy, setBusy] = useState(false);
  const [taken, setTaken] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  const rateCents = toCents(f.rate);
  const linkedin = f.linkedin.trim() && !/^https?:\/\//i.test(f.linkedin.trim()) ? `https://${f.linkedin.trim()}` : f.linkedin.trim();
  const mismatch = f.confirm.length > 0 && f.confirm !== f.password;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTaken(false);
    if (f.name.trim().length < 2) return toast.error('Enter your full name.');
    if (f.password.length < 8) return toast.error('Use at least 8 characters for your password.');
    if (f.password !== f.confirm) return toast.error('The passwords don’t match. Type the same password twice.');
    if (f.expertise.trim().length < 3) return toast.error('Tell students what you can help with.');
    if (rateCents === null || rateCents < MIN_RATE || rateCents > MAX_RATE) return toast.error('Enter a session rate between GH₵ 10 and GH₵ 100,000.');
    if (!LINKEDIN.test(linkedin)) return toast.error('Enter your LinkedIn profile link, e.g. https://www.linkedin.com/in/your-name');
    setBusy(true);
    try {
      const { needsConfirmation } = await signUpWithEmail({
        email: f.email.trim(),
        password: f.password,
        fullName: f.name.trim(),
        as: 'mentor',
        mentorApplication: { expertise: f.expertise.trim().slice(0, 300), rate_cents: rateCents, linkedin_url: linkedin },
      });
      toast.success('Application sent. We’ll review it and email you.');
      if (needsConfirmation) setSentTo(f.email.trim());
    } catch (err) {
      if (err instanceof EmailTakenError) setTaken(true);
      else toast.error(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <RedirectIfSignedIn>
      <AuthLayout
        eyebrow="Afriversity mentors"
        title="Apply as a Mentor"
        lede="Share what you know with students across Africa. Every application is reviewed before your profile goes live."
        footer={
          <p>
            Already a mentor? <Link to="/mentor/login">Sign in</Link>
          </p>
        }
      >
        {sentTo ? (
          <motion.div className="auth-form__inbox" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={spring} role="status">
            <MailCheck aria-hidden="true" />
            <h2>Check your inbox</h2>
            <p>
              We sent a confirmation link to <strong>{sentTo}</strong>. Confirm your email; then the team reviews your application, rate and LinkedIn.
            </p>
          </motion.div>
        ) : (
          <form className="auth-form auth-form__form" onSubmit={submit} noValidate>
            <Field label="Full name" autoComplete="name" icon={<UserRound />} value={f.name} onChange={set('name')} maxLength={120} required />
            <Field label="Email" type="email" inputMode="email" autoComplete="email" icon={<Mail />} value={f.email} onChange={set('email')} required />
            <Field label="Password" type="password" autoComplete="new-password" icon={<Lock />} hint="At least 8 characters." value={f.password} onChange={set('password')} required />
            <Field
              label="Confirm password"
              type="password"
              autoComplete="new-password"
              icon={<KeyRound />}
              value={f.confirm}
              onChange={set('confirm')}
              error={mismatch ? 'The passwords don’t match.' : null}
              required
            />
            <Field label="Expertise" icon={<Briefcase />} placeholder="e.g. Medicine, scholarship essays, UK admissions" hint="Separate topics with commas." value={f.expertise} onChange={set('expertise')} maxLength={300} required />
            <Field
              label="Rate per 1-hour session (GH₵)"
              type="number"
              inputMode="decimal"
              min={10}
              step="1"
              icon={<Coins />}
              placeholder="e.g. 150"
              value={f.rate}
              onChange={set('rate')}
              hint={rateCents && rateCents >= MIN_RATE ? `You receive ${formatMoney(Math.round(rateCents * 0.75), 'GHS')} per session (75%).` : 'You keep 75%; Afriversity keeps 25%.'}
              required
            />
            <Field label="LinkedIn profile" type="url" inputMode="url" icon={<Link2 />} placeholder="https://www.linkedin.com/in/your-name" value={f.linkedin} onChange={set('linkedin')} maxLength={300} required />
            {taken && (
              <p className="auth-form__error" role="alert">
                This email is already registered. Please <Link to="/mentor/login">sign in instead</Link>.
              </p>
            )}
            <Button type="submit" size="lg" block loading={busy} disabled={!f.email || !f.password || !f.confirm || mismatch}>
              Apply as a mentor
            </Button>
          </form>
        )}
      </AuthLayout>
    </RedirectIfSignedIn>
  );
}
