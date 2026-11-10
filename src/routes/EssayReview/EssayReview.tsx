import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Globe2, PenLine, Sparkles } from 'lucide-react';
import { PageTransition } from '../../components/PageTransition/PageTransition';
import { PageHeader } from '../../components/PageHeader/PageHeader';
import { Button } from '../../components/Button/Button';
import { Chip } from '../../components/Chip/Chip';
import { Field, SelectField, TextAreaField } from '../../components/Field/Field';
import { Notice } from '../../components/Notice/Notice';
import { essayHistory, reviewEssay } from '../../features/ai/api';
import {
  AUTO_TYPE, countWords, DEFAULT_LIMIT, DESTINATIONS, isV2, MISSING_LABEL, missingInfo, TYPE_LABEL, typesFor,
  type Destination, type EssayType, type LimitUnit, type MissingInfo,
} from '../../features/ai/essay';
import type { AiConversation, ChatMessage } from '../../features/ai/types';
import { fetchOpportunities } from '../../features/opportunities/api';
import { errorMessage } from '../../lib/supabase';
import { riseItem } from '../../lib/motion';
import { LegacyReviewCard, ReviewDashboard } from './ReviewDashboard';
import './EssayReview.css';

const MIN_CHARS = 150;
const PROMPT_ID = 'essay-prompt';
const UNITS: LimitUnit[] = ['words', 'characters'];
// UCAS sets the same three questions for everyone (from 2026 entry); the form pre-fills them.
const UCAS_QUESTIONS = [
  '1. Why do you want to study this course or subject?',
  '2. How have your qualifications and studies helped you prepare for this course or subject?',
  '3. What else have you done to prepare outside of education, and why are these experiences useful?',
].join('\n');

type Shown = { review: NonNullable<ChatMessage['review']>; conversationId: string | null };

const shownFrom = (h: AiConversation): Shown | null => {
  const review = h.messages.find((m) => m.review)?.review;
  if (!review) return null;
  return { review, conversationId: h.id };
};

/** AI Essay Reviewer for international university applications — free for every signed-in student. */
export default function EssayReview() {
  const [destination, setDestination] = useState<Destination | null>(null);
  const [country, setCountry] = useState('');
  const [type, setType] = useState<EssayType | 'auto'>('auto');
  const [university, setUniversity] = useState('');
  const [programme, setProgramme] = useState('');
  const [scholarships, setScholarships] = useState<Array<{ slug: string; title: string }>>([]);
  const [scholarship, setScholarship] = useState('');
  const [prompt, setPrompt] = useState('');
  const [limitValue, setLimitValue] = useState('');
  const [limitUnit, setLimitUnit] = useState<LimitUnit>('words');
  const [essay, setEssay] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [askMissing, setAskMissing] = useState<MissingInfo[] | null>(null);
  const [shown, setShown] = useState<Shown | null>(null);
  const [history, setHistory] = useState<AiConversation[]>([]);

  useEffect(() => {
    Promise.all([fetchOpportunities(), essayHistory()])
      .then(([o, h]) => {
        setScholarships(o.filter((x) => x.status !== 'closed').map((x) => ({ slug: x.slug, title: x.title })));
        setHistory(h);
      })
      .catch((e) => setError(errorMessage(e)));
  }, []);

  const words = useMemo(() => countWords(essay), [essay]);
  const limit = Number(limitValue) > 0 ? { value: Math.round(Number(limitValue)), unit: limitUnit } : null;
  const used = limit?.unit === 'characters' ? essay.length : words;
  const over = limit ? used > limit.value : false;
  const typeOptions = destination ? typesFor(destination) : (Object.keys(TYPE_LABEL) as EssayType[]);

  // Choosing a type fills in what that application system fixes (limit, UCAS questions).
  const chooseType = (label: string) => {
    const next = (typeOptions.find((t) => TYPE_LABEL[t] === label) ?? 'auto') as EssayType | 'auto';
    const prevDefault = type !== 'auto' ? DEFAULT_LIMIT[type] : undefined;
    const nextDefault = next !== 'auto' ? DEFAULT_LIMIT[next] : undefined;
    if (!limitValue || (prevDefault && Number(limitValue) === prevDefault.value && limitUnit === prevDefault.unit)) {
      setLimitValue(nextDefault ? String(nextDefault.value) : '');
      setLimitUnit(nextDefault?.unit ?? 'words');
    }
    if (next === 'ucas' && !prompt.trim()) setPrompt(UCAS_QUESTIONS);
    if (type === 'ucas' && next !== 'ucas' && prompt === UCAS_QUESTIONS) setPrompt('');
    setType(next);
    setAskMissing(null);
  };

  const send = async () => {
    if (!destination) return;
    setBusy(true);
    setError(null);
    setAskMissing(null);
    try {
      const res = await reviewEssay({
        essay,
        destination,
        country,
        essay_type: type,
        university,
        programme,
        prompt,
        limit,
        scholarship_slug: type === 'scholarship' ? scholarship || undefined : undefined,
      });
      if (res.message.review) setShown({ review: res.message.review, conversationId: res.conversation_id });
      setHistory(await essayHistory());
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!destination) return setError('Choose where you are applying first. Rules differ a lot between countries.');
    // Ask once for details that change the review; the student can still go ahead without them.
    const missing = missingInfo({ type, prompt, university, programme, hasLimit: Boolean(limit) });
    if (missing.length && !askMissing) {
      setAskMissing(missing);
      if (missing.includes('prompt')) document.getElementById(PROMPT_ID)?.focus();
      return;
    }
    void send();
  };

  return (
    <PageTransition label="AI Essay Reviewer">
      <div className="container essay">
        <PageHeader
          back={{ to: '/courses', label: 'Learn' }}
          eyebrow="Free · International applications"
          title="AI Essay Reviewer"
          lede="For applications to universities abroad, not local Ghanaian admissions: the US, UK, Canada, Europe and beyond. Reviewed against that country’s rules, in your own voice."
        />

        <AnimatePresence mode="wait">
          {shown &&
            (isV2(shown.review) ? (
              <ReviewDashboard key={shown.conversationId ?? 'new'} review={shown.review} />
            ) : (
              <LegacyReviewCard key={shown.conversationId ?? 'old'} review={shown.review} />
            ))}
        </AnimatePresence>

        <motion.form className="essay__form" onSubmit={submit} variants={riseItem} initial="hidden" animate="show" noValidate>
          <fieldset className="essay__group">
            <legend className="essay__legend"><Globe2 aria-hidden="true" /> Where are you applying?</legend>
            <div className="essay__dests" role="radiogroup" aria-label="Destination">
              {DESTINATIONS.map((d) => (
                <Chip key={d.id} kind="radio" selected={destination === d.id} onToggle={() => { setDestination(d.id); setAskMissing(null); setError(null); }}>
                  {d.label}
                  <span className="essay__dest-sys">{d.system}</span>
                </Chip>
              ))}
            </div>
            {(destination === 'europe' || destination === 'other') && (
              <Field label="Which country?" placeholder={destination === 'europe' ? 'e.g. Germany' : 'e.g. Australia'} value={country} onChange={(e) => setCountry(e.target.value)} maxLength={60} />
            )}
          </fieldset>

          <fieldset className="essay__group" disabled={!destination}>
            <legend className="essay__legend">The application</legend>
            <SelectField
              label="Essay type"
              options={[AUTO_TYPE, ...typeOptions.map((t) => TYPE_LABEL[t])]}
              value={type === 'auto' ? AUTO_TYPE : TYPE_LABEL[type]}
              onChange={(e) => chooseType(e.target.value)}
              hint="Each type is judged by its own purpose: a UCAS statement is not a Common App essay."
            />
            <div className="essay__row">
              <Field label="University" placeholder="e.g. University of Toronto" value={university} onChange={(e) => setUniversity(e.target.value)} maxLength={120} />
              <Field label="Programme or course" placeholder="e.g. Computer Science" value={programme} onChange={(e) => setProgramme(e.target.value)} maxLength={120} />
            </div>
            {type === 'scholarship' && scholarships.length > 0 && (
              <SelectField
                label="Listed scholarship (optional)"
                options={scholarships.map((s) => s.title)}
                placeholder="Not one of these"
                value={scholarships.find((s) => s.slug === scholarship)?.title ?? ''}
                onChange={(e) => setScholarship(scholarships.find((s) => s.title === e.target.value)?.slug ?? '')}
                hint="We’ll check your essay against its selection criteria."
              />
            )}
            <TextAreaField
              id={PROMPT_ID}
              label="Essay prompt or question"
              placeholder="Paste the exact question from the application"
              value={prompt}
              onChange={(e) => { setPrompt(e.target.value); setAskMissing(null); }}
              maxLength={2000}
              rows={3}
              hint={type === 'ucas' ? 'UCAS asks the same three questions of everyone.' : 'The review checks that your essay answers this.'}
            />
            <div className="essay__limit">
              <Field label="Word or character limit" type="number" inputMode="numeric" min={10} max={20000} placeholder="e.g. 650" value={limitValue} onChange={(e) => { setLimitValue(e.target.value.replace(/\D/g, '').slice(0, 5)); setAskMissing(null); }} />
              <SelectField label="Counted in" options={UNITS} value={limitUnit} onChange={(e) => setLimitUnit(e.target.value as LimitUnit)} />
            </div>
            {type !== 'auto' && DEFAULT_LIMIT[type] && <p className="essay__hint">{DEFAULT_LIMIT[type]!.note} Change it if your application says otherwise.</p>}
          </fieldset>

          <fieldset className="essay__group" disabled={!destination}>
            <legend className="essay__legend"><PenLine aria-hidden="true" /> Your essay</legend>
            <TextAreaField
              label="Essay"
              value={essay}
              onChange={(e) => setEssay(e.target.value)}
              maxLength={15000}
              rows={12}
              hint={`${words} words · ${essay.length.toLocaleString()} characters${limit ? ` · limit ${limit.value.toLocaleString()} ${limit.unit}` : ''}${essay.length < MIN_CHARS ? ` · at least ${MIN_CHARS} characters` : ''}`}
            />
            {over && limit && <p className="essay__over" role="status">{used - limit.value} {limit.unit} over the limit. The review will point out what to cut.</p>}
          </fieldset>

          {askMissing && (
            <Notice
              tone="info"
              action={
                <Button size="sm" variant="secondary" onClick={() => void send()} loading={busy}>
                  Review anyway
                </Button>
              }
            >
              For an accurate review, add {askMissing.map((m) => MISSING_LABEL[m]).join(', ')}. Without {askMissing.length === 1 ? 'it' : 'them'} we can’t fully check {askMissing.includes('prompt') ? 'whether you answer the question' : 'fit and length'}.
            </Notice>
          )}
          {error && <Notice tone="error">{error}</Notice>}
          <Button type="submit" size="lg" block loading={busy && !askMissing} disabled={!destination || essay.trim().length < MIN_CHARS} icon={<Sparkles aria-hidden="true" />}>
            Review my essay
          </Button>
          <p className="essay__fine">A reviewer, not a ghost-writer: you get scores, corrections and suggestions, never a rewritten essay or invented achievements. Your essay is saved to your account.</p>
        </motion.form>

        {history.length > 0 && (
          <section className="essay__history" aria-labelledby="hist-h">
            <h2 id="hist-h">Past reviews</h2>
            <ul role="list">
              {history.map((h) => {
                const s = shownFrom(h);
                const score = s ? (isV2(s.review) ? s.review.overall.score : s.review.score) : null;
                return (
                  <li key={h.id}>
                    <button type="button" className="essay__past" onClick={() => s && setShown(s)}>
                      <PenLine aria-hidden="true" />
                      <span className="essay__past-title">{h.title}</span>
                      {score !== null && <span className="essay__past-score">{score}/10</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </PageTransition>
  );
}
