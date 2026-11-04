import { motion } from 'framer-motion';
import { ArrowUpRight, Calculator } from 'lucide-react';
import { ButtonLink } from '../../components/Button/Button';
import { riseItem } from '../../lib/motion';
import { CURRICULA, type WassceResults } from './types';
import './ResultCalculator.css';

export type ResultsStripProps = {
  /** undefined while loading (renders nothing). */
  results: WassceResults | null | undefined;
  /** The university's published cut-off points, if the admin added them. */
  cutoffLink?: string | null;
};

/** The student's aggregate at the top of the apply pages, plus the university's cut-off link. */
export function ResultsStrip({ results, cutoffLink }: ResultsStripProps) {
  if (results === undefined) return null;
  const cutoff = cutoffLink && /^https:\/\//i.test(cutoffLink) && (
    <a className="btn" data-variant="secondary" data-size="sm" href={cutoffLink} target="_blank" rel="noopener noreferrer">
      <span className="btn__label">View Cut-Off Points</span>
      <ArrowUpRight aria-hidden="true" />
    </a>
  );

  return (
    <motion.section className="results-strip" variants={riseItem} initial="hidden" animate="show" aria-label="Your WASSCE aggregate">
      {results ? (
        <>
          <span className="results-strip__value">{results.aggregate}</span>
          <span className="results-strip__text">
            <span className="results-strip__label">Your WASSCE aggregate</span>
            <span className="results-strip__detail">
              {CURRICULA[results.curriculum]?.label ?? 'WASSCE'} · lower is better, 6 is the best
            </span>
          </span>
          <span className="results-strip__actions">
            {cutoff}
            <ButtonLink to="/results" variant="quiet" size="sm">
              Edit results
            </ButtonLink>
          </span>
        </>
      ) : (
        <>
          <Calculator className="results-strip__icon" aria-hidden="true" width={28} height={28} />
          <span className="results-strip__text">
            <span className="results-strip__label">Know your aggregate</span>
            <span className="results-strip__detail">Enter or scan your WASSCE grades to compare with cut-off points.</span>
          </span>
          <span className="results-strip__actions">
            {cutoff}
            <ButtonLink to="/results" variant="secondary" size="sm">
              Add my results
            </ButtonLink>
          </span>
        </>
      )}
    </motion.section>
  );
}
