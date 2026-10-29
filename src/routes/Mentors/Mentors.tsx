import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CalendarCheck, Users } from 'lucide-react';
import { PageTransition } from '../../components/PageTransition/PageTransition';
import { PageHeader } from '../../components/PageHeader/PageHeader';
import { ListSkeleton } from '../../components/Skeleton/Skeleton';
import { EmptyState } from '../../components/EmptyState/EmptyState';
import { Notice } from '../../components/Notice/Notice';
import { Tag } from '../../components/Chip/Chip';
import { fetchMentors, fetchMySessions, type SessionWithNames } from '../../features/mentors/api';
import type { Mentor } from '../../features/mentors/types';
import { formatMoney } from '../../lib/money';
import { formatWhen, initials } from '../../features/mentors/format';
import { errorMessage } from '../../lib/supabase';
import { lift, press, riseItem, staggerParent } from '../../lib/motion';
import './Mentors.css';

const MotionLink = motion.create(Link);

export default function Mentors() {
  const [mentors, setMentors] = useState<Mentor[] | null>(null);
  const [sessions, setSessions] = useState<SessionWithNames[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchMentors(), fetchMySessions()])
      .then(([m, s]) => {
        setMentors(m);
        setSessions(s.filter((x) => x.status === 'confirmed' && new Date(x.scheduled_at).getTime() > Date.now() - 3_600_000));
      })
      .catch((e) => setError(errorMessage(e)));
  }, []);

  return (
    <PageTransition label="Mentors">
      <div className="container mentors">
        <PageHeader back={{ to: '/courses', label: 'Learn' }} eyebrow="Mentors" title="Learn from people who've done it" lede="Book a one-to-one video session. Pay with MoMo or card; your mentor receives 75%." />

        {sessions.length > 0 && (
          <section className="mentors__upcoming" aria-labelledby="up-h">
            <h2 id="up-h" className="mentors__h2">
              Your upcoming sessions
            </h2>
            {sessions.map((s) => (
              <div key={s.id} className="session-pill">
                <CalendarCheck aria-hidden="true" />
                <span>
                  <strong>{s.mentor_name}</strong> · {formatWhen(s.scheduled_at)}
                </span>
              </div>
            ))}
          </section>
        )}

        {error && <Notice tone="error">{error}</Notice>}
        {!mentors && !error && (
          <ListSkeleton kind="mentor" count={4} label="Loading mentors" className="mentors__grid" />
        )}
        {mentors && mentors.length === 0 && (
          <EmptyState icon={Users} title="Mentors are being onboarded">
            <p>Every mentor is reviewed by the Afriversity team before they can take bookings. Approved mentors appear here.</p>
          </EmptyState>
        )}
        {mentors && mentors.length > 0 && (
          <motion.div className="mentors__grid" variants={staggerParent} initial="hidden" animate="show">
            {mentors.map((m) => (
              <MotionLink key={m.id} to={`/mentors/${m.id}`} className="mentor-card" variants={riseItem} whileHover={lift} whileTap={press}>
                <span className="mentor-card__avatar" aria-hidden="true">
                  {initials(m.display_name)}
                </span>
                <span className="mentor-card__text">
                  <span className="mentor-card__name">{m.display_name}</span>
                  {m.headline && <span className="mentor-card__headline">{m.headline}</span>}
                  <span className="mentor-card__tags">
                    {m.expertise.slice(0, 3).map((x) => (
                      <Tag key={x}>{x}</Tag>
                    ))}
                  </span>
                </span>
                {m.rate_cents ? <span className="mentor-card__rate">{formatMoney(m.rate_cents, m.currency)}/hr</span> : null}
              </MotionLink>
            ))}
          </motion.div>
        )}
      </div>
    </PageTransition>
  );
}
