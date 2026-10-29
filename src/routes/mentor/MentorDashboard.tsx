import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CalendarCheck, Clock3, LogOut, ShieldCheck, XCircle } from 'lucide-react';
import { PageTransition } from '../../components/PageTransition/PageTransition';
import { Logo } from '../../components/Logo/Logo';
import { Button } from '../../components/Button/Button';
import { Field, TextAreaField } from '../../components/Field/Field';
import { Notice } from '../../components/Notice/Notice';
import { Skeleton } from '../../components/Skeleton/Skeleton';
import { useAuth } from '../../features/auth/useAuth';
import { fetchMySessions, fetchOwnMentor, updateOwnMentor, type SessionWithNames } from '../../features/mentors/api';
import { formatWhen } from '../../features/mentors/format';
import type { Mentor } from '../../features/mentors/types';
import { formatMoney, toCents } from '../../lib/money';
import { errorMessage } from '../../lib/supabase';
import { riseItem, spring, staggerParent } from '../../lib/motion';
import './MentorDashboard.css';

const STATUS_COPY: Record<Mentor['status'], { icon: typeof Clock3; title: string; body: string }> = {
  pending: {
    icon: Clock3,
    title: 'Application under review',
    body: 'An Afriversity admin reviews every mentor and sets up your payout account before your profile goes live. Complete your profile below in the meantime.',
  },
  approved: {
    icon: ShieldCheck,
    title: 'You are live',
    body: 'Students can find and book you. Paid bookings appear under Sessions.',
  },
  rejected: {
    icon: XCircle,
    title: 'Application not approved',
    body: 'Your mentor application was not approved this time. Contact the Afriversity team if you think this is a mistake.',
  },
};

type Draft = { display_name: string; headline: string; bio: string; expertise: string; country: string; availability: string; rate: string };

const MIN_RATE = 1000; // GHS 10, matches the database check
const MAX_RATE = 10_000_000;

const REVIEW_COPY: Record<NonNullable<Mentor['rate_review']>, string | null> = {
  none: null,
  pending: 'Waiting for admin approval. Students keep seeing your current approved rate until then.',
  approved: 'Approved. This is the rate students pay.',
  rejected: 'Not approved. Adjust it and save to send a new proposal.',
};

export default function MentorDashboard() {
  const { profile, signOut } = useAuth();
  const [mentor, setMentor] = useState<Mentor | null>(null);
  const [next, setNext] = useState<SessionWithNames | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!profile) return;
    Promise.all([fetchOwnMentor(profile.id), fetchMySessions()])
      .then(([m, sessions]) => {
        if (!m) {
          setError('No mentor record exists for this account.');
          return;
        }
        setMentor(m);
        setDraft({
          display_name: m.display_name,
          headline: m.headline ?? '',
          bio: m.bio ?? '',
          expertise: m.expertise.join(', '),
          country: m.country ?? '',
          availability: m.availability ?? '',
          rate: m.proposed_rate_cents ? String(m.proposed_rate_cents / 100) : '',
        });
        setNext(sessions.find((s) => s.mentor_id === m.id && s.status === 'confirmed' && new Date(s.scheduled_at).getTime() > Date.now()) ?? null);
      })
      .catch((e) => setError(errorMessage(e)));
  }, [profile]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!mentor || !draft) return;
    const rateCents = draft.rate.trim() ? toCents(draft.rate) : null;
    if (draft.rate.trim() && (rateCents === null || rateCents < MIN_RATE || rateCents > MAX_RATE)) {
      setError('Hourly rate must be between GHS 10 and GHS 100,000.');
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await updateOwnMentor(mentor.id, {
        display_name: draft.display_name.trim() || mentor.display_name,
        headline: draft.headline.trim() || null,
        bio: draft.bio.trim() || null,
        expertise: draft.expertise.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 8),
        country: draft.country.trim() || null,
        availability: draft.availability.trim() || null,
        // Only send the rate when it changed, so saving the profile doesn't re-open a review.
        ...(rateCents !== (mentor.proposed_rate_cents ?? null) ? { proposed_rate_cents: rateCents } : {}),
      });
      setMentor(updated);
      setSaved(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const copy = mentor ? STATUS_COPY[mentor.status] : null;
  const Icon = copy?.icon;
  const set = (k: keyof Draft, v: string) => setDraft((d) => (d ? { ...d, [k]: v } : d));

  return (
    <PageTransition label="Mentor dashboard">
      <motion.div className="container mentor-dash" variants={staggerParent} initial="hidden" animate="show">
        <motion.header className="mentor-dash__bar" variants={riseItem}>
          <Logo to="/mentor/dashboard" />
          <Button variant="quiet" size="sm" icon={<LogOut aria-hidden="true" />} onClick={signOut}>
            Sign out
          </Button>
        </motion.header>

        <motion.div variants={riseItem} className="mentor-dash__intro">
          <p className="eyebrow">Mentor dashboard</p>
          <h1 className="mentor-dash__title">{mentor?.display_name ?? profile?.full_name ?? 'Welcome'}</h1>
        </motion.div>

        {error && <Notice tone="error">{error}</Notice>}

        {!mentor && !error && (
          <div className="mentor-dash__card" aria-busy="true">
            <Skeleton width="40px" height="40px" shape="circle" />
            <Skeleton width="60%" height="16px" />
          </div>
        )}

        {mentor && copy && Icon && (
          <motion.section className="mentor-dash__card" data-status={mentor.status} variants={riseItem} aria-live="polite">
            <motion.span className="mentor-dash__icon" initial={{ scale: 0.5, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={spring}>
              <Icon aria-hidden="true" />
            </motion.span>
            <h2>{copy.title}</h2>
            <p>{copy.body}</p>
            {mentor.status === 'approved' && mentor.rate_cents ? (
              <p className="mentor-dash__rate">
                Live rate: {formatMoney(mentor.rate_cents, 'GHS')}/hour · you receive {formatMoney(Math.round(mentor.rate_cents * 0.75), 'GHS')} per session
              </p>
            ) : null}
          </motion.section>
        )}

        {next && (
          <motion.div variants={riseItem}>
            <Link to="/mentor/sessions" className="mentor-dash__next">
              <CalendarCheck aria-hidden="true" />
              <span>
                Next: <strong>{next.student_name}</strong> · {formatWhen(next.scheduled_at)}
              </span>
            </Link>
          </motion.div>
        )}

        {mentor && draft && mentor.status !== 'rejected' && (
          <motion.form className="mentor-dash__form" variants={riseItem} onSubmit={save} aria-labelledby="mp-h">
            <h2 id="mp-h" className="mentor-dash__h2">
              Your public profile
            </h2>
            <Field label="Display name" value={draft.display_name} onChange={(e) => set('display_name', e.target.value)} maxLength={120} />
            <Field label="Headline" placeholder="e.g. Data engineer at a Lagos fintech" value={draft.headline} onChange={(e) => set('headline', e.target.value)} maxLength={140} />
            <TextAreaField label="About you" value={draft.bio} onChange={(e) => set('bio', e.target.value)} maxLength={1200} />
            <Field label="Expertise (comma-separated)" placeholder="Data engineering, SQL, Career switching" value={draft.expertise} onChange={(e) => set('expertise', e.target.value)} />
            <Field label="Country" value={draft.country} onChange={(e) => set('country', e.target.value)} maxLength={80} />
            <Field label="Availability" placeholder="e.g. Weekday evenings and Saturday mornings (GMT)" value={draft.availability} onChange={(e) => set('availability', e.target.value)} maxLength={200} />
            <fieldset className="mentor-dash__rate-box" data-review={mentor.rate_review ?? 'none'}>
              <legend className="mentor-dash__h3">Hourly rate</legend>
              <Field
                label="Your proposed rate (GHS per hour)"
                inputMode="decimal"
                placeholder="e.g. 150"
                value={draft.rate}
                onChange={(e) => set('rate', e.target.value)}
                hint={draft.rate && toCents(draft.rate) ? `Students pay ${formatMoney(toCents(draft.rate) ?? 0, 'GHS')}. You receive ${formatMoney(Math.round((toCents(draft.rate) ?? 0) * 0.75), 'GHS')}; Afriversity keeps 25%.` : 'Every session is one hour. An admin approves each rate before students see it.'}
              />
              {mentor.rate_review && REVIEW_COPY[mentor.rate_review] && (
                <p className="mentor-dash__review" data-review={mentor.rate_review}>
                  {REVIEW_COPY[mentor.rate_review]}
                </p>
              )}
            </fieldset>
            {saved && <Notice tone="success">Profile saved.</Notice>}
            <Button type="submit" size="lg" block loading={saving}>
              Save profile
            </Button>
          </motion.form>
        )}
      </motion.div>
    </PageTransition>
  );
}
