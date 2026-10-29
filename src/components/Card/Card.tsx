import { forwardRef, type PointerEvent } from 'react';
import type { HTMLMotionProps } from 'framer-motion';
import { motion } from 'framer-motion';
import { lift, press, riseItem } from '../../lib/motion';
import './Card.css';

export type CardProps = HTMLMotionProps<'article'> & {
  /** Adds hover lift, pointer spotlight + press feedback; use when the whole card is tappable. */
  interactive?: boolean;
  tone?: 'default' | 'raised' | 'outline';
};

/**
 * Glass surface container. Inherits stagger variants from a parent when present.
 * Interactive cards track the pointer in --mx/--my so the CSS spotlight follows it
 * (CSS variables only — no React re-render per pointer move).
 */
export const Card = forwardRef<HTMLElement, CardProps>(function Card(
  { interactive, tone = 'default', className, children, onPointerMove, ...rest },
  ref,
) {
  const track = (e: PointerEvent<HTMLElement>) => {
    onPointerMove?.(e);
    if (!interactive || e.pointerType !== 'mouse') return;
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - r.left}px`);
    el.style.setProperty('--my', `${e.clientY - r.top}px`);
  };

  return (
    <motion.article
      ref={ref}
      variants={riseItem}
      className={className ? `card ${className}` : 'card'}
      data-tone={tone}
      data-interactive={interactive || undefined}
      whileHover={interactive ? lift : undefined}
      whileTap={interactive ? press : undefined}
      onPointerMove={track}
      {...rest}
    >
      {children}
    </motion.article>
  );
});
