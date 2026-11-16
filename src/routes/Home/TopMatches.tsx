import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { BadgeCheck, Building2, CalendarClock, ChevronLeft, ChevronRight, MapPin, UsersRound } from 'lucide-react';
import { Tag } from '../../components/Chip/Chip';
import { Skeleton } from '../../components/Skeleton/Skeleton';
import { CategoryMedia } from '../../features/opportunities/CategoryMedia';
import { categoryOf, KIND_ICON, KIND_LABEL } from '../../features/opportunities/category';
import { FUNDING_LABEL } from '../../features/opportunities/types';
import { feeOf } from '../../features/universities/types';
import type { TopItem } from '../../features/home/topMatches';
import { countdownFor } from '../../lib/dates';
import { formatMoney } from '../../lib/money';
import { riseItem, staggerParent } from '../../lib/motion';
import './TopMatches.css';

/** One wide card. Each type keeps the dark glass surface; only its accent colour changes. */
function MatchCard({ item }: { item: TopItem }) {
  if (item.type === 'opportunity') {
    const o = item.opportunity;
    const countdown = countdownFor(o);
    return (
      <Link to={`/opportunity/${o.slug}`} className="match-card" data-cat={categoryOf(o.kind)}>
        <CategoryMedia className="match-card__media" image={o.cover_image_url} icon={KIND_ICON[o.kind]} />
        <div className="match-card__body">
          <p className="match-card__kicker">
            <span className="cat-label">{KIND_LABEL[o.kind]}</span>
            {item.reason && (
              <>
                <span aria-hidden="true"> · </span>
                <span className="visually-hidden">, </span>
                {item.reason}
              </>
            )}
          </p>
          <h3 className="match-card__title">{o.title}</h3>
          <p className="match-card__sub">{o.provider}</p>
          <div className="match-card__meta">
            {o.is_verified && (
              <Tag tone="emerald">
                <BadgeCheck aria-hidden="true" />
                Verified
              </Tag>
            )}
            <Tag tone={countdown.tone}>
              <CalendarClock aria-hidden="true" />
              {countdown.label}
            </Tag>
            <Tag>{FUNDING_LABEL[o.funding]}</Tag>
          </div>
        </div>
      </Link>
    );
  }

  if (item.type === 'mentor') {
    const m = item.mentor;
    return (
      <Link to={`/mentors/${m.id}`} className="match-card" data-cat="mentorship">
        <CategoryMedia className="match-card__media" icon={UsersRound} />
        <div className="match-card__body">
          <p className="match-card__kicker">
            <span className="cat-label">Mentorship</span>
            {m.expertise[0] && (
              <>
                <span aria-hidden="true"> · </span>
                <span className="visually-hidden">, </span>
                {m.expertise[0]}
              </>
            )}
          </p>
          <h3 className="match-card__title">{m.display_name}</h3>
          <p className="match-card__sub">{m.headline ?? 'Book a one-to-one video session'}</p>
          <div className="match-card__meta">
            {m.rate_cents ? <Tag>{formatMoney(m.rate_cents, m.currency)} / hour</Tag> : null}
            {m.country && (
              <Tag>
                <MapPin aria-hidden="true" />
                {m.country}
              </Tag>
            )}
          </div>
        </div>
      </Link>
    );
  }

  const u = item.university;
  return (
    <Link to={`/apply-university/${u.slug}`} className="match-card" data-cat="university">
      <CategoryMedia className="match-card__media" image={u.cover_image_url} icon={Building2} />
      <div className="match-card__body">
        <p className="match-card__kicker">
          <span className="cat-label">University application</span>
        </p>
        <h3 className="match-card__title">{u.name}</h3>
        <p className="match-card__sub">We buy the voucher and submit your forms.</p>
        <div className="match-card__meta">
          <Tag>
            <MapPin aria-hidden="true" />
            {u.city}, {u.country}
          </Tag>
          {feeOf(u) > 0 && <Tag>Apply for {formatMoney(feeOf(u), u.currency)}</Tag>}
        </div>
      </div>
    </Link>
  );
}

/**
 * "Top matches": a horizontal shelf of wide cards under the greeting. Swipe on phones;
 * on desktop, arrow buttons page through it (wheel and trackpad scrolling still work).
 */
export function TopMatches({ items, loading }: { items: TopItem[]; loading: boolean }) {
  const track = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });

  const measure = useCallback(() => {
    const el = track.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setEdges({ start: el.scrollLeft <= 4, end: el.scrollLeft >= max - 4 });
  }, []);

  useEffect(() => {
    measure();
    const el = track.current;
    if (!el) return;
    el.addEventListener('scroll', measure, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', measure);
      ro.disconnect();
    };
  }, [measure, items.length]);

  const page = (dir: 1 | -1) => {
    const el = track.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: 'smooth' });
  };

  if (!loading && items.length === 0) return null;

  return (
    <section className="top-matches" aria-labelledby="top-matches-h">
      <div className="top-matches__head">
        <h2 id="top-matches-h" className="top-matches__title">
          Top matches
        </h2>
        <div className="top-matches__nav">
          <button type="button" className="top-matches__arrow" aria-label="Previous matches" disabled={edges.start} onClick={() => page(-1)}>
            <ChevronLeft aria-hidden="true" />
          </button>
          <button type="button" className="top-matches__arrow" aria-label="More matches" disabled={edges.end} onClick={() => page(1)}>
            <ChevronRight aria-hidden="true" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="top-matches__track">
          <div className="top-matches__item">
            <Skeleton shape="block" height="320px" label="Loading your top matches" />
          </div>
          <div className="top-matches__item">
            <Skeleton shape="block" height="320px" />
          </div>
        </div>
      ) : (
        <motion.ul ref={track} className="top-matches__track" role="list" variants={staggerParent} initial="hidden" animate="show">
          {items.map((item) => (
            <motion.li key={item.id} className="top-matches__item" variants={riseItem}>
              <MatchCard item={item} />
            </motion.li>
          ))}
        </motion.ul>
      )}
    </section>
  );
}
