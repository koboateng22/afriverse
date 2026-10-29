import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Wallet } from 'lucide-react';
import { PageTransition } from '../../components/PageTransition/PageTransition';
import { PageHeader } from '../../components/PageHeader/PageHeader';
import { CountUp } from '../../components/CountUp/CountUp';
import { EmptyState } from '../../components/EmptyState/EmptyState';
import { Notice } from '../../components/Notice/Notice';
import { ListSkeleton } from '../../components/Skeleton/Skeleton';
import { fetchMySessions, type SessionWithNames } from '../../features/mentors/api';
import { formatWhen } from '../../features/mentors/format';
import { useAuth } from '../../features/auth/useAuth';
import { formatMoney } from '../../lib/money';
import { errorMessage } from '../../lib/supabase';
import { riseItem, staggerParent } from '../../lib/motion';
import './MentorPages.css';

const MENTOR_SHARE = 0.75;

export default function MentorEarnings() {
  const { profile } = useAuth();
  const [sessions, setSessions] = useState<SessionWithNames[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMySessions()
      .then((s) => setSessions(s.filter((x) => x.mentor_id === profile?.id)))
      .catch((e) => setError(errorMessage(e)));
  }, [profile?.id]);

  // Totals per currency — amounts are never mixed across currencies.
  const totals = useMemo(() => {
    const map = new Map<string, { gross: number; share: number; count: number }>();
    for (const s of sessions ?? []) {
      const t = map.get(s.currency) ?? { gross: 0, share: 0, count: 0 };
      t.gross += s.amount_cents;
      t.share += s.amount_cents - Math.round(s.amount_cents * (1 - MENTOR_SHARE));
      t.count += 1;
      map.set(s.currency, t);
    }
    return [...map.entries()];
  }, [sessions]);

  return (
    <PageTransition label="Earnings">
      <div className="container mentor-page">
        <PageHeader eyebrow="Mentor" title="Earnings" />
        <Notice tone="info">
          You receive 75% of each booking; Afriversity keeps 25%. Payouts are settled manually — your share is routed to your bank by Paystack on its normal settlement schedule.
        </Notice>
        {error && <Notice tone="error">{error}</Notice>}
        {!sessions && !error && <ListSkeleton kind="mentor" count={3} label="Loading sessions" />}
        {sessions && sessions.length === 0 && (
          <EmptyState icon={Wallet} title="No earnings yet">
            <p>Your first paid booking will show here.</p>
          </EmptyState>
        )}
        {totals.length > 0 && (
          <motion.div className="earn-stats" variants={staggerParent} initial="hidden" animate="show">
            {totals.map(([currency, t]) => (
              <motion.div key={currency} className="earn-stat" variants={riseItem}>
                <p className="earn-stat__label">Your share ({currency})</p>
                <p className="earn-stat__value">
                  <CountUp value={t.share} format={(n) => formatMoney(Math.round(n), currency)} />
                </p>
                <p className="earn-stat__sub">
                  {t.count} paid {t.count === 1 ? 'session' : 'sessions'} · {formatMoney(t.gross, currency)} gross
                </p>
              </motion.div>
            ))}
          </motion.div>
        )}
        {sessions && sessions.length > 0 && (
          <section className="mentor-page__section" aria-labelledby="hist-h">
            <h2 id="hist-h">History</h2>
            <motion.ul role="list" className="session-list" variants={staggerParent} initial="hidden" animate="show">
              {[...sessions].reverse().map((s) => (
                <motion.li key={s.id} className="session-row" variants={riseItem}>
                  <div className="session-row__main">
                    <p className="session-row__who">{s.student_name}</p>
                    <p className="session-row__when">{formatWhen(s.scheduled_at)}</p>
                  </div>
                  <div className="session-row__side">
                    <span className="session-row__amount">{formatMoney(s.amount_cents - Math.round(s.amount_cents * (1 - MENTOR_SHARE)), s.currency)}</span>
                    <span className="session-row__when">of {formatMoney(s.amount_cents, s.currency)}</span>
                  </div>
                </motion.li>
              ))}
            </motion.ul>
          </section>
        )}
      </div>
    </PageTransition>
  );
}
