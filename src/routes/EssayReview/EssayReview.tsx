import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Lock, PenLine, Sparkles } from 'lucide-react';
import { PageTransition } from '../../components/PageTransition/PageTransition';
import { PageHeader } from '../../components/PageHeader/PageHeader';
import { Button } from '../../components/Button/Button';
import { Field, SelectField, TextAreaField } from '../../components/Field/Field';
import { Notice } from '../../components/Notice/Notice';
import { EmptyState } from '../../components/EmptyState/EmptyState';
import { essayHistory, reviewEssay, type EssayTarget } from '../../features/ai/api';
import type { AiConversation, EssayReview as Review } from '../../features/ai/types';
import { fetchOpportunities } from '../../features/opportunities/api';
import { fetchUniversities } from '../../features/universities/api';
import { usePlan } from '../../features/billing/PlanProvider';
import { usePaywall } from '../../features/billing/PaywallModal';
import { errorMessage } from '../../lib/supabase';
import { riseItem, spring, staggerParent } from '../../lib/motion';
import './EssayReview.css';

const MIN_CHARS = 300;

function ReviewCard({ review }: { review: Review }) {
  return (
    <motion.section className="review" variants={staggerParent} initial="hidden" animate="show" aria-label="Essay review">
      <motion.div className="review__score" variants={riseItem}>
        <motion.span className="review__score-num" initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={spring}>
          {review.score}
        </motion.span>
        <span className="review__score-of">/ 10</span>
        <p className="review__summary">{review.summary}</p>
      </motion.div>
      {review.strengths.length > 0 && (
        <motion.div className="review__block" variants={riseItem}>
          <h3>What works</h3>
          <ul>{review.strengths.map((s) => <li key={s}>{s}</li>)}</ul>
        </motion.div>
      )}
      {review.improvements.length > 0 && (
        <motion.div className="review__block" data-tone="improve" variants={riseItem}>
          <h3>Improve next</h3>
          <ol>{review.improvements.map((s) => <li key={s}>{s}</li>)}</ol>
        </motion.div>
      )}
      {review.edits.length > 0 && (
        <motion.div className="review__block" variants={riseItem}>
          <h3>Suggested rewrites</h3>
          {review.edits.map((e) => (
            <div key={e.original} className="review__edit">
              <p className="review__orig">{e.original}</p>
              <p className="review__sugg">{e.suggestion}</p>
            </div>
          ))}
        </motion.div>
      )}
      {review.fit.length > 0 && (
        <motion.div className="review__block" variants={riseItem}>
          <h3>Fit with what they look for</h3>
          <ul>{review.fit.map((s) => <li key={s}>{s}</li>)}</ul>
        </motion.div>
      )}
    </motion.section>
  );
}

/** Pro: AI Essay Reviewer. */
export default function EssayReview() {
  const { isPro, loading } = usePlan();
  const { openPaywall } = usePaywall();
  const [targets, setTargets] = useState<Array<{ value: string; label: string }>>([]);
  const [target, setTarget] = useState('');
  const [prompt, setPrompt] = useState('');
  const [essay, setEssay] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [history, setHistory] = useState<AiConversation[]>([]);

  useEffect(() => {
    if (!isPro) return;
    Promise.all([fetchOpportunities(), fetchUniversities(), essayHistory()])
      .then(([o, u, h]) => {
        setTargets([
          ...o.filter((x) => x.status !== 'closed').map((x) => ({ value: `opportunity:${x.slug}`, label: x.title })),
          ...u.map((x) => ({ value: `university:${x.slug}`, label: x.name })),
        ]);
        setHistory(h);
      })
      .catch((e) => setError(errorMessage(e)));
  }, [isPro]);

  const words = useMemo(() => essay.trim().split(/\s+/).filter(Boolean).length, [essay]);
  const labels = targets.map((t) => t.label);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const picked = targets.find((t) => t.label === target);
      const [type, slug] = (picked?.value ?? '').split(':');
      const res = await reviewEssay({ essay, prompt, target: picked ? ({ type, slug } as EssayTarget) : null });
      if (res.message.review) setReview(res.message.review);
      setHistory(await essayHistory());
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (!loading && !isPro) {
    return (
      <PageTransition label="AI Essay Reviewer">
        <div className="container essay">
          <PageHeader back={{ to: '/courses', label: 'Learn' }} eyebrow="Pro" title="AI Essay Reviewer" />
          <EmptyState
            icon={Lock}
            title="Get your essay reviewed in seconds"
            action={
              <Button variant="gold" onClick={() => openPaywall('The AI Essay Reviewer scores your essay, shows what to fix, and suggests rewrites — part of Pro.')}>
                Unlock with Pro
              </Button>
            }
          >
            <p>Paste a personal statement or scholarship essay and get a score, clear fixes and sentence rewrites, checked against what the programme asks for.</p>
          </EmptyState>
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition label="AI Essay Reviewer">
      <div className="container essay">
        <PageHeader back={{ to: '/courses', label: 'Learn' }} eyebrow="Pro" title="AI Essay Reviewer" />

        <AnimatePresence>{review && <ReviewCard key={review.summary} review={review} />}</AnimatePresence>

        <motion.form className="essay__form" onSubmit={submit} variants={riseItem} initial="hidden" animate="show">
          <SelectField label="Applying to (optional)" options={labels} placeholder="Nothing specific" value={target} onChange={(e) => setTarget(e.target.value)} />
          <Field label="Essay question (optional)" placeholder="e.g. Describe a time you showed leadership" value={prompt} onChange={(e) => setPrompt(e.target.value)} maxLength={500} />
          <TextAreaField
            label="Your essay"
            value={essay}
            onChange={(e) => setEssay(e.target.value)}
            maxLength={12000}
            hint={`${words} words${essay.length < MIN_CHARS ? ` · at least ${MIN_CHARS} characters` : ''}`}
          />
          {error && <Notice tone="error">{error}</Notice>}
          <Button type="submit" size="lg" block loading={busy} disabled={essay.trim().length < MIN_CHARS} icon={<Sparkles aria-hidden="true" />}>
            Review my essay
          </Button>
        </motion.form>

        {history.length > 0 && (
          <section className="essay__history" aria-labelledby="hist-h">
            <h2 id="hist-h">Past reviews</h2>
            <ul role="list">
              {history.map((h) => {
                const r = h.messages.find((m) => m.review)?.review;
                return (
                  <li key={h.id}>
                    <button type="button" className="essay__past" onClick={() => r && setReview(r)}>
                      <PenLine aria-hidden="true" />
                      <span className="essay__past-title">{h.title}</span>
                      {r && <span className="essay__past-score">{r.score}/10</span>}
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
