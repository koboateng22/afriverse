import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { BadgeCheck, CalendarClock, ChevronLeft, ChevronRight } from 'lucide-react';
import { Tag } from '../../components/Chip/Chip';
import { Skeleton } from '../../components/Skeleton/Skeleton';
import { CategoryIcon } from '../../features/opportunities/CategoryMedia';
import { categoryOf, KIND_ICON, KIND_LABEL } from '../../features/opportunities/category';
import { FUNDING_LABEL } from '../../features/opportunities/types';
import type { TopItem } from '../../features/home/topMatches';
import { MATCH_STRONG } from '../../features/opportunities/matcher';
import { countdownFor } from '../../lib/dates';
import { riseItem, staggerParent } from '../../lib/motion';
import './TopMatches.css';

/** The top-left tile: the cover image as a thumbnail when there is one, else the large category icon. */
function MatchThumb({ image, icon }: { image?: string | null; icon: TopItem['opportunity']['kind'] }) {
  const [broken, setBroken] = useState(false);
  if (image && !broken) {
    return (
      <span className="match-card__thumb" aria-hidden="true">
        <img src={image} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)} />
      </span>
    );
  }
  return (
    <span className="match-card__thumb" data-icon aria-hidden="true">
      <CategoryIcon icon={KIND_ICON[icon]} />
    </span>
  );
}

/** One compact card: big icon (or thumbnail) top-left, then title, provider and key facts, in an emerald→gold glowing frame. */
function MatchCard({ item }: { item: TopItem }) {
  const o = item.opportunity;
  const countdown = countdownFor(o);
  return (
    <Link to={`/opportunity/${o.slug}`} className="match-card" data-cat={categoryOf(o.kind)}>
      <div className="match-card__top">
        <MatchThumb image={o.cover_image_url} icon={o.kind} />
        <p className="match-card__kicker">
          <span className="cat-label">{KIND_LABEL[o.kind]}</span>
          <span className="visually-hidden">, </span>
          <span className="match-card__reason" data-strong={item.match.score >= MATCH_STRONG || undefined}>
            {item.reason}
          </span>
        </p>
      </div>
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
    </Link>
  );
}

/**
 * "Top matches": the 3–5 opportunities that fit the student best, as a horizontal shelf. Swipe on phones;
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
            <Skeleton shape="block" height="220px" label="Loading your top matches" />
          </div>
          <div className="top-matches__item">
            <Skeleton shape="block" height="220px" />
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
