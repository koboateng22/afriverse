import type { Opportunity } from '../features/opportunities/types';

const DAY = 86_400_000;

/** Parses a SQL `date` (YYYY-MM-DD) as a local calendar day. */
export function parseDay(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Whole days from today until the end of `iso` (negative = past). */
export function daysUntil(iso: string, now = new Date()): number {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((parseDay(iso).getTime() - today.getTime()) / DAY);
}

export function formatDay(iso: string): string {
  return parseDay(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export type Countdown = { label: string; tone: 'urgent' | 'gold' | 'neutral' | 'emerald'; days: number | null };

/** Human countdown for a card: "Closes in 5 days", "Opens 9 Mar 2027", "Rolling intake". */
export function countdownFor(o: Pick<Opportunity, 'status' | 'deadline' | 'opens_on'>, now = new Date()): Countdown {
  if (o.status === 'open' && o.deadline) {
    const d = daysUntil(o.deadline, now);
    if (d < 0) return { label: 'Deadline passed', tone: 'neutral', days: d };
    if (d === 0) return { label: 'Closes today', tone: 'urgent', days: 0 };
    if (d === 1) return { label: 'Closes tomorrow', tone: 'urgent', days: 1 };
    return { label: `Closes in ${d} days`, tone: d <= 14 ? 'urgent' : 'gold', days: d };
  }
  if (o.status === 'rolling') return { label: 'Rolling intake', tone: 'emerald', days: null };
  if (o.status === 'upcoming') {
    return o.opens_on ? { label: `Opens ${formatDay(o.opens_on)}`, tone: 'gold', days: daysUntil(o.opens_on, now) } : { label: 'Between rounds', tone: 'neutral', days: null };
  }
  return { label: 'Closed this cycle', tone: 'neutral', days: null };
}
