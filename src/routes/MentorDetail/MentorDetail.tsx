import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Clock, SearchX } from 'lucide-react';
import { PageTransition } from '../../components/PageTransition/PageTransition';
import { PageHeader } from '../../components/PageHeader/PageHeader';
import { Button } from '../../components/Button/Button';
import { Chip, Tag } from '../../components/Chip/Chip';
import { TextAreaField } from '../../components/Field/Field';
import { EmptyState } from '../../components/EmptyState/EmptyState';
import { Notice } from '../../components/Notice/Notice';
import { Skeleton } from '../../components/Skeleton/Skeleton';
import { fetchMentor } from '../../features/mentors/api';
import type { Mentor } from '../../features/mentors/types';
import { startCheckout } from '../../features/billing/paystack';
import { formatMoney } from '../../lib/money';
import { errorMessage } from '../../lib/supabase';
import { riseItem, staggerParent } from '../../lib/motion';
import { initials } from '../../features/mentors/format';
import './MentorDetail.css';

const HOURS = [9, 11, 14, 16, 18];

/** Next 14 days starting tomorrow (bookings need 12h notice). */
function upcomingDays(): Date[] {
  const out: Date[] = [];
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  for (let i = 1; i <= 14; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    out.push(d);
  }
  return out;
}

export default function MentorDetail() {
  const { id = '' } = useParams();
  const [mentor, setMentor] = useState<Mentor | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const days = useMemo(upcomingDays, []);
  const [day, setDay] = useState(0);
  const [hour, setHour] = useState<number | null>(null);
  const [topic, setTopic] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchMentor(id)
      .then((m) => setMentor(m && m.status === 'approved' ? m : null))
      .catch((e) => setError(errorMessage(e)));
  }, [id]);

  if (mentor === null) {
    return (
      <PageTransition label="Mentor not found">
        <div className="container">
          <PageHeader back={{ to: '/mentors', label: 'Mentors' }} title="Mentor not available" />
          <EmptyState icon={SearchX} title="This mentor isn't taking bookings">
            <p>They may be paused or no longer on Afriversity.</p>
          </EmptyState>
        </div>
      </PageTransition>
    );
  }

  const slot = hour === null ? null : (() => {
    const d = new Date(days[day]);
    d.setHours(hour, 0, 0, 0);
    return d;
  })();

  const book = async () => {
    if (!mentor || !slot) return;
    setBusy(true);
    setError(null);
    try {
      // Price + split are computed server-side from the mentor's row.
      await startCheckout({ type: 'mentor', mentor_id: mentor.id, scheduled_at: slot.toISOString(), topic: topic.trim() || undefined });
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <PageTransition label={mentor?.display_name ?? 'Mentor'}>
      <div className="container mentor-detail">
        <PageHeader back={{ to: '/mentors', label: 'Mentors' }} eyebrow="Mentor" title={mentor?.display_name ?? 'Loading…'} lede={mentor?.headline ?? undefined} />

        {!mentor ? (
          <Skeleton shape="block" height="160px" label="Loading mentor" />
        ) : (
          <motion.div className="mentor-detail__body" variants={staggerParent} initial="hidden" animate="show">
            <motion.div className="mentor-detail__intro" variants={riseItem}>
              <span className="mentor-detail__avatar" aria-hidden="true">
                {initials(mentor.display_name)}
              </span>
              <div className="mentor-detail__facts">
                <p className="mentor-detail__rate">{mentor.rate_cents ? `${formatMoney(mentor.rate_cents, mentor.currency)} per hour · 60 min session` : 'Rate awaiting approval'}</p>
                {mentor.country && <p>{mentor.country}</p>}
                {mentor.availability && (
                  <p className="mentor-detail__avail">
                    <Clock aria-hidden="true" /> {mentor.availability}
                  </p>
                )}
              </div>
            </motion.div>
            {mentor.expertise.length > 0 && (
              <motion.div className="mentor-detail__tags" variants={riseItem}>
                {mentor.expertise.map((x) => (
                  <Tag key={x} tone="emerald">
                    {x}
                  </Tag>
                ))}
              </motion.div>
            )}
            {mentor.bio && (
              <motion.p variants={riseItem} className="mentor-detail__bio">
                {mentor.bio}
              </motion.p>
            )}

            <motion.section variants={riseItem} className="booking" aria-labelledby="book-h">
              <h2 id="book-h" className="booking__h2">
                Pick a time
              </h2>
              <div className="booking__days" role="radiogroup" aria-label="Day">
                {days.map((d, i) => (
                  <Chip key={d.toISOString()} kind="radio" selected={day === i} onToggle={() => setDay(i)} layoutGroup="book-day">
                    {d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
                  </Chip>
                ))}
              </div>
              <div className="booking__times" role="radiogroup" aria-label="Start time (your local time)">
                {HOURS.map((h) => (
                  <Chip key={h} kind="radio" selected={hour === h} onToggle={() => setHour(h)} layoutGroup="book-hour">
                    {String(h).padStart(2, '0')}:00
                  </Chip>
                ))}
              </div>
              <p className="booking__tz">Times are in your local time zone. If a slot is already taken we'll tell you before you pay.</p>
              <TextAreaField label="What would you like to talk about? (optional)" maxLength={300} value={topic} onChange={(e) => setTopic(e.target.value)} />
            </motion.section>

            {error && <Notice tone="error">{error}</Notice>}

            <Button size="lg" block disabled={!slot || !mentor.rate_cents} loading={busy} onClick={book}>
              {slot && mentor.rate_cents ? `Pay ${formatMoney(mentor.rate_cents, mentor.currency)} and book` : 'Choose a time to continue'}
            </Button>
          </motion.div>
        )}
      </div>
    </PageTransition>
  );
}
