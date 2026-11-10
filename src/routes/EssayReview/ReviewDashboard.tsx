import { motion } from 'framer-motion';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Check, CircleHelp, Flag, ListChecks, ListOrdered, PenLine, Quote, Ruler, SpellCheck, Target } from 'lucide-react';
import { Notice } from '../../components/Notice/Notice';
import { criterionLabel, DESTINATIONS, MISSING_LABEL, OFFICIAL_SOURCE, TYPE_LABEL, type EssayReviewV2, type LimitCheck } from '../../features/ai/essay';
import type { LegacyEssayReview } from '../../features/ai/types';
import { riseItem, spring, staggerParent } from '../../lib/motion';

/** Words for a score band. These describe the writing, never the chance of admission. */
const band = (score: number | null) =>
  score === null ? 'Not enough to score' : score >= 8 ? 'Strong draft' : score >= 6 ? 'Promising draft' : score >= 4 ? 'Developing draft' : 'Early draft';

const KIND_LABEL = { generic: 'Generic', repetitive: 'Repetitive', vague: 'Vague', unnecessary: 'Unnecessary', unsupported: 'Unsupported claim' } as const;
const ROLE_LABEL = { opening: 'Opening', body: 'Body', conclusion: 'Conclusion' } as const;
const VERDICT = {
  answers: { label: 'Answers the prompt', tone: 'good' },
  partly: { label: 'Partly answers the prompt', tone: 'warn' },
  misses: { label: 'Misses the prompt', tone: 'bad' },
  no_prompt: { label: 'Prompt not checked', tone: 'neutral' },
} as const;

function LengthCheck({ limit, count }: { limit: LimitCheck; count: { words: number; characters: number; paragraphs?: number } }) {
  const both = `${count.words} words · ${count.characters.toLocaleString()} characters${count.paragraphs ? ` · ${count.paragraphs} paragraph${count.paragraphs === 1 ? '' : 's'}` : ''}`;
  if (!limit.value) {
    return (
      <p className="len" data-status="unknown">
        <Ruler aria-hidden="true" /> {both}. No limit given: add the word or character limit to check length.
      </p>
    );
  }
  const pct = Math.min(100, Math.round((limit.used / limit.value) * 100));
  const label =
    limit.status === 'over' ? `${limit.used - limit.value} ${limit.unit} over the limit`
    : limit.status === 'under_min' ? `Under the ${limit.min}-${limit.unit} minimum`
    : `Within the limit (${limit.value - limit.used} ${limit.unit} to spare)`;
  return (
    <div className="len" data-status={limit.status}>
      <p>
        <Ruler aria-hidden="true" /> <strong>{limit.used.toLocaleString()} / {limit.value.toLocaleString()} {limit.unit}</strong> · {label}
      </p>
      <span className="len__bar" aria-hidden="true"><span style={{ inlineSize: `${pct}%` }} /></span>
      <p className="len__note">
        {both}. Limit {limit.source === 'applicant' ? 'you entered' : `from ${limit.source}`}. Counted by Afriversity, not the AI; application portals may count slightly differently.
      </p>
    </div>
  );
}

/**
 * International essay review. Order follows how a student works through it:
 * overall → length & prompt → category scores → strengths/weaknesses → priorities →
 * paragraph by paragraph → opening & conclusion → corrections (must fix) → suggestions (optional).
 */
export function ReviewDashboard({ review }: { review: EssayReviewV2 }) {
  const c = review.context;
  const place = DESTINATIONS.find((d) => d.id === c.destination)?.label ?? 'International';
  const verdict = VERDICT[review.prompt_alignment.verdict];
  const showOpening = review.opening?.assessment || review.opening?.recommendation;
  const showConclusion = review.conclusion?.assessment || review.conclusion?.recommendation;

  return (
    <motion.section className="review" variants={staggerParent} initial="hidden" animate="show" aria-label="Essay review">
      {/* Overall */}
      <motion.div className="review__score" variants={riseItem}>
        <div className="review__score-row">
          <motion.span className="review__score-num" initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={spring}>
            {review.overall.score ?? '–'}
          </motion.span>
          <span className="review__score-of">
            / 10 writing quality
            <span className="review__band">{band(review.overall.score)}</span>
          </span>
        </div>
        <p className="review__summary">{review.overall.summary}</p>
        <ul className="review__ctx" aria-label="What this was reviewed against">
          <li>{place}{c.country ? ` · ${c.country}` : ''}</li>
          <li>{TYPE_LABEL[c.detected_type] ?? 'Essay'}</li>
          {c.university && <li>{c.university}</li>}
          {c.programme && <li>{c.programme}</li>}
        </ul>
        {(review.strongest?.length > 0 || review.weakest?.length > 0) && (
          <div className="review__areas">
            {review.strongest?.length > 0 && (
              <p data-tone="good"><ArrowUpRight aria-hidden="true" /> Strongest: {review.strongest.map(criterionLabel).join(', ')}</p>
            )}
            {review.weakest?.length > 0 && (
              <p data-tone="bad"><ArrowDownRight aria-hidden="true" /> Weakest: {review.weakest.map(criterionLabel).join(', ')}</p>
            )}
          </div>
        )}
        {review.type_note && <p className="review__note"><CircleHelp aria-hidden="true" /> {review.type_note}</p>}
        <p className="review__disclaimer">
          Scores rate the essay’s writing and how well it answers the prompt, against {place} conventions for this essay type. They are not a prediction or guarantee of admission.
        </p>
      </motion.div>

      {review.questions.length > 0 || review.missing.length > 0 ? (
        <motion.div variants={riseItem}>
          <Notice tone="info">
            <strong>Add these for a sharper review:</strong>{' '}
            {review.missing.length > 0 && `${review.missing.map((m) => MISSING_LABEL[m]).join(', ')}. `}
            {review.questions.join(' ')}
          </Notice>
        </motion.div>
      ) : null}

      <motion.div className="review__grid2" variants={riseItem}>
        <div className="review__block">
          <h3><Ruler aria-hidden="true" /> Length</h3>
          <LengthCheck limit={review.limit} count={review.count} />
        </div>
        <div className="review__block" data-verdict={verdict.tone}>
          <h3><Target aria-hidden="true" /> How well it answers the prompt</h3>
          <p className="review__verdict">{verdict.label}</p>
          <p className="review__muted">{review.prompt_alignment.note}</p>
          {c.prompt && <details className="review__prompt"><summary>The prompt</summary><p>{c.prompt}</p></details>}
        </div>
      </motion.div>

      {/* Category scores */}
      <motion.div className="review__block" variants={riseItem}>
        <h3><ListChecks aria-hidden="true" /> Category scores</h3>
        <ul className="crit" role="list">
          {review.scores.map((s) => (
            <li key={s.key} className="crit__item" data-na={s.score === null || undefined}>
              <span className="crit__name">{criterionLabel(s.key)}</span>
              <span className="crit__score">{s.score === null ? 'N/A' : `${s.score}/10`}</span>
              <span className="crit__bar" aria-hidden="true"><span style={{ inlineSize: `${(s.score ?? 0) * 10}%` }} /></span>
              <span className="crit__why">{s.why}</span>
            </li>
          ))}
        </ul>
      </motion.div>

      {(review.strengths.length > 0 || review.weaknesses?.length > 0) && (
        <motion.div className="review__grid2" variants={riseItem}>
          {review.strengths.length > 0 && (
            <div className="review__block">
              <h3><Check aria-hidden="true" /> Strengths</h3>
              <ul>{review.strengths.map((s) => <li key={s}>{s}</li>)}</ul>
            </div>
          )}
          {review.weaknesses?.length > 0 && (
            <div className="review__block" data-tone="improve">
              <h3><Flag aria-hidden="true" /> Weaknesses</h3>
              <ul>{review.weaknesses.map((s) => <li key={s}>{s}</li>)}</ul>
            </div>
          )}
        </motion.div>
      )}

      {review.improvements.length > 0 && (
        <motion.div className="review__block" data-tone="improve" variants={riseItem}>
          <h3><ListOrdered aria-hidden="true" /> What to work on first</h3>
          <ol className="improve">
            {review.improvements.map((i, n) => (
              <li key={i.issue}>
                <span className="improve__priority">Priority {n + 1}</span>
                <strong>{i.issue}</strong>
                {i.why && <span className="review__muted"> {i.why}</span>}
                {i.how && <p className="improve__how">{i.how}</p>}
              </li>
            ))}
          </ol>
        </motion.div>
      )}

      {review.sections?.length > 0 && (
        <motion.div className="review__block" variants={riseItem}>
          <h3>Paragraph by paragraph</h3>
          {review.count.paragraphs === 1 && <p className="review__muted">Your essay is one block of text. Breaking it into paragraphs will make it easier to read.</p>}
          <ol className="sections" role="list">
            {review.sections.map((s) => (
              <li key={s.paragraph} className="sections__item">
                <p className="sections__head">
                  <span className="sections__num">¶{s.paragraph}</span> {ROLE_LABEL[s.role]} · <q>{s.excerpt}</q>
                </p>
                {s.assessment && <p>{s.assessment}</p>}
                {s.suggestion && <p className="sections__sugg">{s.suggestion}</p>}
              </li>
            ))}
          </ol>
        </motion.div>
      )}

      {(showOpening || showConclusion) && (
        <motion.div className="review__grid2" variants={riseItem}>
          {showOpening && (
            <div className="review__block">
              <h3>Opening</h3>
              <p className="review__muted">{review.opening.assessment}</p>
              {review.opening.recommendation && <p className="improve__how">{review.opening.recommendation}</p>}
            </div>
          )}
          {showConclusion && (
            <div className="review__block">
              <h3>Conclusion</h3>
              <p className="review__muted">{review.conclusion.assessment}</p>
              {review.conclusion.recommendation && <p className="improve__how">{review.conclusion.recommendation}</p>}
            </div>
          )}
        </motion.div>
      )}

      {review.storytelling_reflection?.length > 0 && (
        <motion.div className="review__block" variants={riseItem}>
          <h3>Storytelling &amp; reflection</h3>
          <ul>{review.storytelling_reflection.map((s) => <li key={s}>{s}</li>)}</ul>
        </motion.div>
      )}

      {review.flagged.length > 0 && (
        <motion.div className="review__block" variants={riseItem}>
          <h3><Quote aria-hidden="true" /> Statements to rethink</h3>
          <ul className="flags" role="list">
            {review.flagged.map((f) => (
              <li key={f.quote} data-kind={f.kind}>
                <span className="flags__kind">{KIND_LABEL[f.kind] ?? f.kind}</span>
                <q className="flags__quote">{f.quote}</q>
                <span className="review__muted">{f.note}</span>
              </li>
            ))}
          </ul>
        </motion.div>
      )}

      {review.corrections?.length > 0 && (
        <motion.div className="review__block" variants={riseItem}>
          <h3><SpellCheck aria-hidden="true" /> Corrections <span className="review__tag" data-kind="fix">errors to fix</span></h3>
          {review.corrections.map((g) => (
            <div key={g.original} className="review__edit">
              <p className="review__orig">{g.original}</p>
              <p className="review__sugg">{g.corrected}</p>
              {g.note && <p className="review__muted">{g.note}</p>}
            </div>
          ))}
        </motion.div>
      )}

      {review.suggestions?.length > 0 && (
        <motion.div className="review__block" variants={riseItem}>
          <h3><PenLine aria-hidden="true" /> Suggestions <span className="review__tag" data-kind="optional">optional</span></h3>
          <p className="review__muted">Ideas for weak sentences, built only from what you wrote. Use them as a starting point and put them in your own words; fill any [brackets] with real details.</p>
          {review.suggestions.map((r) => (
            <div key={r.original} className="review__edit" data-kind="suggestion">
              <p className="review__orig-plain">{r.original}</p>
              <p className="review__sugg">{r.suggestion}</p>
              {r.why && <p className="review__muted">{r.why}</p>}
              {r.unverified.length > 0 && (
                <p className="review__warn">
                  <AlertTriangle aria-hidden="true" /> Mentions {r.unverified.join(', ')}, which isn’t in your essay. Only keep it if it’s true.
                </p>
              )}
            </div>
          ))}
        </motion.div>
      )}

      {review.next_steps.length > 0 && (
        <motion.div className="review__block" variants={riseItem}>
          <h3>Next steps</h3>
          <ol>{review.next_steps.map((s) => <li key={s}>{s}</li>)}</ol>
          <p className="review__muted">{OFFICIAL_SOURCE[c.destination]}</p>
        </motion.div>
      )}
    </motion.section>
  );
}

/** Reviews saved before the international reviewer keep their original layout. */
export function LegacyReviewCard({ review }: { review: LegacyEssayReview }) {
  return (
    <motion.section className="review" variants={staggerParent} initial="hidden" animate="show" aria-label="Essay review">
      <motion.div className="review__score" variants={riseItem}>
        <div className="review__score-row">
          <motion.span className="review__score-num" initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={spring}>
            {review.score}
          </motion.span>
          <span className="review__score-of">/ 10</span>
        </div>
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
