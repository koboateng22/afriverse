import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { parseDay } from '../../lib/dates';
import './Countdown.css';

/** Live countdown to the END of a deadline day (23:59:59 local), ticking each second. */
export function Countdown({ deadline }: { deadline: string }) {
  const end = parseDay(deadline);
  end.setHours(23, 59, 59, 999);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const left = Math.max(0, end.getTime() - now);
  if (left === 0) return <p className="countdown__closed">This round has closed.</p>;

  const units = [
    { label: 'days', value: Math.floor(left / 86_400_000) },
    { label: 'hrs', value: Math.floor(left / 3_600_000) % 24 },
    { label: 'min', value: Math.floor(left / 60_000) % 60 },
    { label: 'sec', value: Math.floor(left / 1000) % 60 },
  ];

  return (
    <div className="countdown" role="timer" aria-label={`${units[0].value} days ${units[1].value} hours left`}>
      {units.map((u) => (
        <div key={u.label} className="countdown__unit" data-urgent={units[0].value < 7 || undefined}>
          <span className="countdown__value" aria-hidden="true">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={u.value}
                initial={{ y: -12, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 12, opacity: 0 }}
                transition={{ duration: 0.18 }}
              >
                {String(u.value).padStart(2, '0')}
              </motion.span>
            </AnimatePresence>
          </span>
          <span className="countdown__label" aria-hidden="true">{u.label}</span>
        </div>
      ))}
    </div>
  );
}
