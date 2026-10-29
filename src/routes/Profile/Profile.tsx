import { useMemo, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Award, Building2, Check, Compass, FileText, Flag, Headset, LogOut, Sparkles, Target, type LucideIcon } from 'lucide-react';
import { usePaywall } from '../../features/billing/PaywallModal';
import { fetchCounselorContact, whatsappLink } from '../../features/billing/api';
import { Notice } from '../../components/Notice/Notice';
import { ListRow } from '../../components/ListRow/ListRow';
import { usePlan } from '../../features/billing/PlanProvider';
import { formatDay } from '../../lib/dates';
import { PageTransition } from '../../components/PageTransition/PageTransition';
import { ProgressRing } from '../../components/ProgressRing/ProgressRing';
import { Field, SelectField, TextAreaField } from '../../components/Field/Field';
import { Button } from '../../components/Button/Button';
import { Chip } from '../../components/Chip/Chip';
import { useAuth } from '../../features/auth/useAuth';
import { profileCompletion, updateProfile } from '../../features/profiles/api';
import type { Profile as ProfileRow } from '../../features/profiles/types';
import { AFRICAN_COUNTRIES, EDUCATION_LEVELS, FIELDS, GOALS } from '../../features/onboarding/options';
import { errorMessage } from '../../lib/supabase';
import { riseItem, spring, staggerParent } from '../../lib/motion';
import './Profile.css';

type Badge = { id: string; name: string; how: string; icon: LucideIcon; earned: (p: ProfileRow, pct: number) => boolean };

const BADGES: Badge[] = [
  { id: 'pathfinder', name: 'Pathfinder', how: 'Finish onboarding', icon: Compass, earned: (p) => Boolean(p.onboarded_at) },
  { id: 'goal-setter', name: 'Goal setter', how: 'Pick 3 or more goals', icon: Target, earned: (p) => p.goals.length >= 3 },
  { id: 'complete', name: 'All set', how: 'Complete your profile', icon: Award, earned: (_, pct) => pct === 100 },
  { id: 'founding', name: 'Founding member', how: 'Joined in 2026', icon: Flag, earned: (p) => new Date(p.created_at) < new Date('2027-01-01T00:00:00Z') },
];

const planLabel = (plan: string | null) => (plan === 'pro' ? 'Pro' : 'Free');

type Draft = Pick<ProfileRow, 'full_name' | 'phone' | 'country' | 'education_level' | 'field_of_interest' | 'bio' | 'goals'>;

const toDraft = (p: ProfileRow): Draft => ({
  full_name: p.full_name ?? '',
  phone: p.phone ?? '',
  country: p.country ?? '',
  education_level: p.education_level ?? '',
  field_of_interest: p.field_of_interest ?? '',
  bio: p.bio ?? '',
  goals: p.goals,
});

export default function Profile() {
  const { profile, setProfile, signOut, session } = useAuth();
  const { plan, isPro, current } = usePlan();
  const { openPaywall } = usePaywall();
  const [counselError, setCounselError] = useState<string | null>(null);

  // Human counsellor (Pro): the number comes from a Pro-gated RPC, never the bundle.
  const talkToCounselor = async () => {
    setCounselError(null);
    if (!isPro) {
      openPaywall('Pro includes a real Afriversity counsellor on WhatsApp for application questions.');
      return;
    }
    try {
      const c = await fetchCounselorContact();
      if (!c.whatsapp) throw new Error('Counsellor chat is being set up — please try again later.');
      window.open(whatsappLink(c.whatsapp, `Hi, I'm ${p.full_name ?? 'an Afriversity Pro student'} and I'd like to speak to a counsellor.`), '_blank', 'noopener');
    } catch (e) {
      setCounselError(errorMessage(e));
    }
  };
  // ProtectedRoute guarantees a profile here.
  const p = profile as ProfileRow;
  const [draft, setDraft] = useState<Draft>(() => toDraft(p));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const { percent, missing } = profileCompletion(p);
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(toDraft(p)), [draft, p]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const onSave = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const updated = await updateProfile(p.id, {
        full_name: draft.full_name?.trim() || null,
        phone: draft.phone?.trim() || null,
        country: draft.country || null,
        education_level: draft.education_level || null,
        field_of_interest: draft.field_of_interest || null,
        bio: draft.bio?.trim() || null,
        goals: draft.goals,
      });
      setProfile(updated);
      setDraft(toDraft(updated));
      setSavedAt(Date.now());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const toggleGoal = (id: string) => set('goals', draft.goals.includes(id) ? draft.goals.filter((g) => g !== id) : [...draft.goals, id]);
  const initials = (p.full_name ?? session?.user.email ?? '?').split(/[\s@]/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('');

  return (
    <PageTransition label="Your profile">
      <motion.div className="container profile" variants={staggerParent} initial="hidden" animate="show">
        <motion.header className="profile__hero" variants={riseItem}>
          <ProgressRing percent={percent} label="Profile complete" />
          <div className="profile__id">
            <span className="profile__avatar" aria-hidden="true">{initials}</span>
            <h1 className="profile__name">{p.full_name || 'Your profile'}</h1>
            <p className="profile__sub">{session?.user.email ?? p.phone ?? ''}</p>
            {missing.length > 0 && <p className="profile__missing">Add {missing.slice(0, 2).join(' and ').toLowerCase()} to reach 100%.</p>}
          </div>
        </motion.header>

        <motion.section className="profile__section" variants={riseItem} aria-labelledby="more-h">
          <h2 id="more-h" className="visually-hidden">Your Afriversity</h2>
          <div className="profile__links">
            <ListRow
              to="/paywall"
              icon={Sparkles}
              label={`${planLabel(plan)} plan`}
              detail={plan && current?.expires_at ? `Active until ${formatDay(current.expires_at.slice(0, 10))}` : 'GHS 60 a month — see what’s included'}
            />
            <ListRow onClick={() => void talkToCounselor()} icon={Headset} label="Talk to a counsellor" detail={isPro ? 'Chat with a real person on WhatsApp' : 'Human counsellor access with Pro'} badge={isPro ? undefined : 'Pro'} />
            <ListRow to="/applications" icon={FileText} label="My applications" detail="Track university applications" />
            <ListRow to="/apply-university" icon={Building2} label="Apply to a university" detail="Let our concierge apply for you" />
          </div>
          {counselError && <Notice tone="error">{counselError}</Notice>}
        </motion.section>

        <motion.section className="profile__section" variants={riseItem} aria-labelledby="badges-h">
          <h2 id="badges-h" className="profile__h2">Badges</h2>
          <ul className="profile__badges" role="list">
            {BADGES.map((b) => {
              const Icon = b.icon;
              const earned = b.earned(p, percent);
              return (
                <li key={b.id} className="badge" data-earned={earned || undefined}>
                  <motion.span className="badge__icon" initial={earned ? { scale: 0.6, rotate: -12 } : false} animate={{ scale: 1, rotate: 0 }} transition={spring}>
                    <Icon aria-hidden="true" />
                  </motion.span>
                  <span className="badge__name">{b.name}</span>
                  <span className="badge__how">{earned ? 'Earned' : b.how}</span>
                </li>
              );
            })}
          </ul>
        </motion.section>

        <motion.form className="profile__section profile__form" variants={riseItem} onSubmit={onSave} aria-labelledby="details-h">
          <h2 id="details-h" className="profile__h2">Your details</h2>
          <Field label="Full name" autoComplete="name" value={draft.full_name ?? ''} onChange={(e) => set('full_name', e.target.value)} />
          <Field label="Phone" type="tel" autoComplete="tel" value={draft.phone ?? ''} onChange={(e) => set('phone', e.target.value)} hint="Used for MoMo receipts and session reminders." />
          <SelectField label="Country" options={AFRICAN_COUNTRIES} placeholder="Choose your country" value={draft.country ?? ''} onChange={(e) => set('country', e.target.value)} />
          <SelectField label="Education level" options={EDUCATION_LEVELS} placeholder="Choose a level" value={draft.education_level ?? ''} onChange={(e) => set('education_level', e.target.value)} />
          <SelectField label="Field of interest" options={FIELDS} placeholder="Choose a field" value={draft.field_of_interest ?? ''} onChange={(e) => set('field_of_interest', e.target.value)} />
          <fieldset className="profile__goals">
            <legend className="field__label">Goals</legend>
            <div className="profile__goal-chips">
              {GOALS.map((g) => (
                <Chip key={g.id} selected={draft.goals.includes(g.id)} onToggle={() => toggleGoal(g.id)}>
                  {g.label}
                </Chip>
              ))}
            </div>
          </fieldset>
          <TextAreaField label="Short bio" maxLength={600} value={draft.bio ?? ''} onChange={(e) => set('bio', e.target.value)} hint="Mentors see this when you book a session." />

          {error && <p className="profile__error" role="alert">{error}</p>}

          <div className="profile__save">
            <Button type="submit" size="lg" block loading={saving} disabled={!dirty}>
              Save changes
            </Button>
            <AnimatePresence>
              {savedAt && !dirty && (
                <motion.p key={savedAt} className="profile__saved" role="status" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <Check aria-hidden="true" /> Saved
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </motion.form>

        <motion.div className="profile__footer" variants={riseItem}>
          <Button variant="quiet" icon={<LogOut aria-hidden="true" />} onClick={signOut}>
            Sign out
          </Button>
          <p className="profile__plan">
            <Sparkles aria-hidden="true" /> {planLabel(plan)} plan
          </p>
        </motion.div>
      </motion.div>
    </PageTransition>
  );
}
