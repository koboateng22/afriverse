import { motion } from 'framer-motion';
import { spring } from '../../lib/motion';
import './ProgressDots.css';

/** Step indicator: the active dot stretches into a pill that slides via layoutId. */
export function ProgressDots({ count, active }: { count: number; active: number }) {
  return (
    <ol className="progress-dots" aria-label={`Step ${active + 1} of ${count}`}>
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="progress-dots__dot" data-done={i < active || undefined} aria-current={i === active ? 'step' : undefined}>
          {i === active && <motion.span className="progress-dots__active" layoutId="progress-dot" transition={spring} />}
        </li>
      ))}
    </ol>
  );
}
