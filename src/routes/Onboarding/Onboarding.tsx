import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, type PanInfo, type Variants } from 'framer-motion';
import { ArrowLeft, ArrowRight, Check, MapPin, MessageCircle, UserRound } from 'lucide-react';
import { PageTransition } from '../../components/PageTransition/PageTransition';
import { Button } from '../../components/Button/Button';
import { Chip } from '../../components/Chip/Chip';
import { Field, SelectField } from '../../components/Field/Field';
import { Logo } from '../../components/Logo/Logo';
import { ProgressDots } from '../../components/ProgressDots/ProgressDots';
import { useAuth } from '../../features/auth/useAuth';
import { updateProfile } from '../../features/profiles/api';
import { toE164 } from '../../lib/phone';
import { AFRICAN_COUNTRIES, EDUCATION_LEVELS, FIELDS, GOALS } from '../../features/onboarding/options';
import { errorMessage } from '../../lib/supabase';
import { easeOut } from '../../lib/motion';
import { FeedLoader } from './FeedLoader';
import './Onboarding.css';

type Answers = { name: string; phone: string; country: string; level: string; field: string; goals: string[] };

const STEPS = [
  { key: 'country', eyebrow: 'Step 1 of 4', title: 'Where are you based?', lede: 'We use your country to show opportunities open to you, and your WhatsApp number so a counsellor can reach you.' },
  { key: 'level', eyebrow: 'Step 2 of 4', title: 'Where are you in your studies?', lede: 'Pick the one that fits you today.' },
  { key: 'field', eyebrow: 'Step 3 of 4', title: 'What field excites you most?', lede: 'You can change this any time from your profile.' },
  { key: 'goals', eyebrow: 'Step 4 of 4', title: 'What do you want from Afriversity?', lede: 'Choose as many as you like.' },
] as const;

const slide: Variants = {
  enter: (dir: number) => ({ x: dir > 0 ? 80 : -80, opacity: 0 }),
  center: { x: 0, opacity: 1, transition: { duration: 0.32, ease: easeOut } },
  exit: (dir: number) => ({ x: dir > 0 ? -80 : 80, opacity: 0, transition: { duration: 0.2, ease: easeOut } }),
};

export default function Onboarding() {
  const { profile, setProfile } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  // Accounts made with an email code have no name yet; Google and password sign-ups do.
  const [askName] = useState(() => !profile?.full_name?.trim());
  const [answers, setAnswers] = useState<Answers>({
    name: profile?.full_name ?? '',
    phone: profile?.phone ?? '',
    country: profile?.country ?? '',
    level: profile?.education_level ?? '',
    field: profile?.field_of_interest ?? '',
    goals: profile?.goals ?? [],
  });
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The WhatsApp number is optional, but if given it must be a real number.
  const phoneE164 = answers.phone.trim() ? toE164(answers.phone) : '';
  const phoneOk = !phoneE164 || /^\+\d{9,15}$/.test(phoneE164);
  const nameOk = !askName || answers.name.trim().length >= 2;
  const valid = [Boolean(answers.country) && phoneOk && nameOk, Boolean(answers.level), Boolean(answers.field), answers.goals.length > 0][step];

  const go = (delta: 1 | -1) => {
    const next = step + delta;
    if (next < 0) return;
    if (delta === 1 && !valid) return;
    if (next >= STEPS.length) {
      finish();
      return;
    }
    setDir(delta);
    setStep(next);
  };

  const finish = async () => {
    if (!profile) return;
    setError(null);
    setFinishing(true);
    // Hold the loader long enough to read, but never fake data: the save is real.
    const minDelay = new Promise((r) => window.setTimeout(r, 1800));
    try {
      const [updated] = await Promise.all([
        updateProfile(profile.id, {
          ...(askName ? { full_name: answers.name.trim() } : {}),
          ...(phoneE164 ? { phone: phoneE164 } : {}),
          country: answers.country,
          education_level: answers.level,
          field_of_interest: answers.field,
          goals: answers.goals,
          onboarded_at: new Date().toISOString(),
        }),
        minDelay,
      ]);
      setProfile(updated);
      navigate('/home', { replace: true });
    } catch (e) {
      setFinishing(false);
      setError(errorMessage(e));
    }
  };

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -80 || info.velocity.x < -500) go(1);
    else if (info.offset.x > 80 || info.velocity.x > 500) go(-1);
  };

  const toggleGoal = (id: string) =>
    setAnswers((a) => ({ ...a, goals: a.goals.includes(id) ? a.goals.filter((g) => g !== id) : [...a.goals, id] }));

  if (finishing) return <FeedLoader field={answers.field} />;

  const s = STEPS[step];

  return (
    <PageTransition bare label="Onboarding">
      <div className="container onboarding">
        <header className="onboarding__bar">
          <Logo compact to="/onboarding" />
          <ProgressDots count={STEPS.length} active={step} />
        </header>

        <div className="onboarding__stage">
          <AnimatePresence mode="wait" custom={dir} initial={false}>
            <motion.section
              key={s.key}
              className="onboarding__step"
              custom={dir}
              variants={slide}
              initial="enter"
              animate="center"
              exit="exit"
              // Step 1 has text fields: dragging there would fight text selection.
              drag={s.key === 'country' ? false : 'x'}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.18}
              onDragEnd={onDragEnd}
              aria-labelledby={`step-${s.key}`}
            >
              <p className="eyebrow">{s.eyebrow}</p>
              <h1 id={`step-${s.key}`} className="onboarding__title">
                {s.title}
              </h1>
              <p className="onboarding__lede">{s.lede}</p>

              <div className="onboarding__answers">
                {s.key === 'country' && (
                  <div className="onboarding__fields">
                    {askName && (
                      <Field
                        label="Your name"
                        autoComplete="name"
                        icon={<UserRound />}
                        value={answers.name}
                        maxLength={120}
                        onChange={(e) => setAnswers((a) => ({ ...a, name: e.target.value }))}
                      />
                    )}
                    <SelectField
                      label="Country"
                      icon={<MapPin />}
                      options={AFRICAN_COUNTRIES}
                      placeholder="Choose your country"
                      value={answers.country}
                      onChange={(e) => setAnswers((a) => ({ ...a, country: e.target.value }))}
                    />
                    <Field
                      label="WhatsApp number (optional)"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      icon={<MessageCircle />}
                      placeholder="e.g. 055 123 4987"
                      value={answers.phone}
                      onChange={(e) => setAnswers((a) => ({ ...a, phone: e.target.value }))}
                      hint="For your counsellor and session reminders. Ghana numbers can start with 0; other countries, include +code."
                      error={phoneOk ? null : 'Check this number, e.g. 055 123 4987 or +233 55 123 4987.'}
                    />
                  </div>
                )}
                {s.key === 'level' && (
                  <div className="onboarding__chips" role="radiogroup" aria-labelledby={`step-${s.key}`}>
                    {EDUCATION_LEVELS.map((l) => (
                      <Chip key={l} kind="radio" selected={answers.level === l} onToggle={() => setAnswers((a) => ({ ...a, level: l }))}>
                        {l}
                      </Chip>
                    ))}
                  </div>
                )}
                {s.key === 'field' && (
                  <div className="onboarding__chips" role="radiogroup" aria-labelledby={`step-${s.key}`}>
                    {FIELDS.map((f) => (
                      <Chip key={f} kind="radio" selected={answers.field === f} onToggle={() => setAnswers((a) => ({ ...a, field: f }))}>
                        {f}
                      </Chip>
                    ))}
                  </div>
                )}
                {s.key === 'goals' && (
                  <div className="onboarding__chips" role="group" aria-labelledby={`step-${s.key}`}>
                    {GOALS.map((g) => (
                      <Chip key={g.id} selected={answers.goals.includes(g.id)} onToggle={() => toggleGoal(g.id)} icon={answers.goals.includes(g.id) ? <Check aria-hidden="true" /> : undefined}>
                        {g.label}
                      </Chip>
                    ))}
                  </div>
                )}
              </div>
            </motion.section>
          </AnimatePresence>
        </div>

        {error && (
          <p className="onboarding__error" role="alert">
            We couldn't save your answers: {error}
          </p>
        )}

        <footer className="onboarding__actions">
          <Button variant="quiet" icon={<ArrowLeft aria-hidden="true" />} onClick={() => go(-1)} disabled={step === 0}>
            Back
          </Button>
          <Button size="lg" iconEnd={<ArrowRight aria-hidden="true" />} onClick={() => go(1)} disabled={!valid}>
            {step === STEPS.length - 1 ? 'Build my feed' : 'Continue'}
          </Button>
        </footer>
        <p className="onboarding__hint" aria-hidden="true">
          Swipe to move between steps
        </p>
      </div>
    </PageTransition>
  );
}
