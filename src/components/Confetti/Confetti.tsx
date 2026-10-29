import { useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import './Confetti.css';

const TONES = ['emerald', 'gold', 'terracotta', 'cream'] as const;

/** One celebratory burst on upgrade/payment success. Skipped with reduced motion. */
export function Confetti({ pieces = 42 }: { pieces?: number }) {
  const reduce = useReducedMotion();
  const bits = useMemo(
    () =>
      Array.from({ length: pieces }, (_, i) => {
        const angle = (Math.PI * 2 * i) / pieces + Math.random() * 0.4;
        const dist = 120 + Math.random() * 180;
        return {
          id: i,
          tone: TONES[i % TONES.length],
          x: Math.cos(angle) * dist,
          y: Math.sin(angle) * dist - 80,
          rotate: Math.random() * 540 - 270,
          delay: Math.random() * 0.12,
          wide: i % 3 === 0,
        };
      }),
    [pieces],
  );
  if (reduce) return null;
  return (
    <div className="confetti" aria-hidden="true">
      {bits.map((b) => (
        <motion.span
          key={b.id}
          className="confetti__bit"
          data-tone={b.tone}
          data-wide={b.wide || undefined}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 0.4 }}
          animate={{ x: b.x, y: [0, b.y, b.y + 260], opacity: [1, 1, 0], rotate: b.rotate, scale: 1 }}
          transition={{ duration: 1.8, delay: b.delay, ease: [0.16, 1, 0.3, 1], times: [0, 0.45, 1] }}
        />
      ))}
    </div>
  );
}
