import { useEffect, useState } from 'react';
import { animate, useReducedMotion } from 'framer-motion';
import './ProgressRing.css';

export type ProgressRingProps = { percent: number; size?: number; label: string };

/** SVG ring that fades in (CSS ring-draw) while the number counts up (Framer). */
export function ProgressRing({ percent, size = 112, label }: ProgressRingProps) {
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? percent : 0);

  useEffect(() => {
    if (reduce) {
      setShown(percent);
      return;
    }
    const controls = animate(0, percent, { duration: 1.1, ease: [0.16, 1, 0.3, 1], onUpdate: (v) => setShown(Math.round(v)) });
    return () => controls.stop();
  }, [percent, reduce]);

  return (
    <div className="ring" role="img" aria-label={`${label}: ${percent}%`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <defs>
          <linearGradient id="ring-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" className="ring__stop-a" />
            <stop offset="100%" className="ring__stop-b" />
          </linearGradient>
        </defs>
        <circle className="ring__track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} />
        <circle
          className="ring__value"
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - percent / 100)}
        />
      </svg>
      <span className="ring__number" aria-hidden="true">
        {shown}
        <small>%</small>
      </span>
    </div>
  );
}
