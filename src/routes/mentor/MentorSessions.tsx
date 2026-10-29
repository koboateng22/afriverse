import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CalendarDays, CheckCircle2 } from 'lucide-react';
import { PageTransition } from '../../components/PageTransition/PageTransition';
import { PageHeader } from '../../components/PageHeader/PageHeader';
import { Button } from '../../components/Button/Button';
import { EmptyState } from '../../components/EmptyState/EmptyState';
import { Notice } from '../../components/Notice/Notice';
import { ListSkeleton } from '../../components/Skeleton/Skeleton';
import { Tag } from '../../components/Chip/Chip';
import { completeSession, fetchMySessions, type SessionWithNames } from '../../features/mentors/api';
import { formatWhen } from '../../features/mentors/format';
import { useAuth } from '../../features/auth/useAuth';
import { formatMoney } from '../../lib/money';
import { errorMessage } from '../../lib/supabase';
import { riseItem, staggerParent } from '../../lib/motion';
import './MentorPages.css';

export default function MentorSessions() {
  const { profile } = useAuth();
  const [sessions, setSessions] = useState<SessionWithNames[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchMySessions()
      .then((s) => setSessions(s.filter((x) => x.mentor_id === profile?.id)))
      .catch((e) => setError(errorMessage(e)));
  }, [profile?.id]);

  useEffect(load, [load]);

  const now = Date.now();
  const upcoming = (sessions ?? []).filter((s) => s.status === 'confirmed' && new Date(s.scheduled_at).getTime() > now);
  const toClose = (sessions ?? []).filter((s) => s.status === 'confirmed' && new Date(s.scheduled_at).getTime() <= now);
  const done = (sessions ?? []).filter((s) => s.status === 'completed').reverse();

  const markDone = async (id: string) => {
    setBusy(id);
    setError(null);
    try {
      await completeSession(id);
      load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const Row = ({ s, action }: { s: SessionWithNames; action?: boolean }) => (
    <motion.li className="session-row" variants={riseItem}>
      <div className="session-row__main">
        <p className="session-row__who">{s.student_name}</p>
        <p className="session-row__when">{formatWhen(s.scheduled_at)} · {s.duration_min} min</p>
        {s.topic && <p className="session-row__topic">“{s.topic}”</p>}
      </div>
      <div className="session-row__side">
        <span className="session-row__amount">{formatMoney(s.amount_cents, s.currency)}</span>
        {action ? (
          <Button size="sm" variant="secondary" loading={busy === s.id} onClick={() => markDone(s.id)} icon={<CheckCircle2 aria-hidden="true" />}>
            Mark done
          </Button>
        ) : (
          <Tag tone={s.status === 'completed' ? 'emerald' : 'gold'}>{s.status}</Tag>
        )}
      </div>
    </motion.li>
  );

  return (
    <PageTransition label="Sessions">
      <div className="container mentor-page">
        <PageHeader eyebrow="Mentor" title="Sessions" lede="Paid bookings only. Send the student a video-call link before the session starts." />
        {error && <Notice tone="error">{error}</Notice>}
        {!sessions && !error && <ListSkeleton kind="mentor" count={3} label="Loading sessions" />}
        {sessions && sessions.length === 0 && (
          <EmptyState icon={CalendarDays} title="No bookings yet">
            <p>When a student books and pays, the session shows up here.</p>
          </EmptyState>
        )}
        {toClose.length > 0 && (
          <section aria-labelledby="close-h" className="mentor-page__section">
            <h2 id="close-h">Waiting to be marked done</h2>
            <motion.ul role="list" className="session-list" variants={staggerParent} initial="hidden" animate="show">
              {toClose.map((s) => (
                <Row key={s.id} s={s} action />
              ))}
            </motion.ul>
          </section>
        )}
        {upcoming.length > 0 && (
          <section aria-labelledby="up-h" className="mentor-page__section">
            <h2 id="up-h">Upcoming</h2>
            <motion.ul role="list" className="session-list" variants={staggerParent} initial="hidden" animate="show">
              {upcoming.map((s) => (
                <Row key={s.id} s={s} />
              ))}
            </motion.ul>
          </section>
        )}
        {done.length > 0 && (
          <section aria-labelledby="done-h" className="mentor-page__section">
            <h2 id="done-h">Completed</h2>
            <motion.ul role="list" className="session-list" variants={staggerParent} initial="hidden" animate="show">
              {done.map((s) => (
                <Row key={s.id} s={s} />
              ))}
            </motion.ul>
          </section>
        )}
      </div>
    </PageTransition>
  );
}
