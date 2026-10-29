import { useEffect, useRef, useState } from 'react';
import { animate, useInView, useReducedMotion } from 'framer-motion';

export type CountUpProps = { value: number; format?: (n: number) => string; duration?: number };

/** Counts up from 0 when scrolled into view (instant with reduced motion). */
export function CountUp({ value, format = (n) => String(Math.round(n)), duration = 1 }: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? value : 0);

  useEffect(() => {
    if (!inView) return;
    if (reduce) {
      setShown(value);
      return;
    }
    const controls = animate(0, value, { duration, ease: [0.16, 1, 0.3, 1], onUpdate: setShown });
    return () => controls.stop();
  }, [inView, value, reduce, duration]);

  return (
    <span ref={ref} aria-label={format(value)}>
      <span aria-hidden="true">{format(shown)}</span>
    </span>
  );
}
