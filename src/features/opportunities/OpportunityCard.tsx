import { memo, useCallback, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion } from 'framer-motion';
import { CalendarClock, Check, Lock, MapPin, Sparkles } from 'lucide-react';
import { Card } from '../../components/Card/Card';
import { Tag } from '../../components/Chip/Chip';
import { countdownFor } from '../../lib/dates';
import { easeOut } from '../../lib/motion';
import { SaveButton } from './SaveButton';
import { MATCH_STRONG, type Match } from './matcher';
import type { BentoSize } from './bento';
import { FUNDING_LABEL, type Opportunity } from './types';
import './OpportunityCard.css';

export type OpportunityCardProps = {
  opportunity: Opportunity;
  saved: boolean;
  onToggleSave: (opportunityId: string) => void;
  /** Pro only: score + reasons from scholarship_matches(). */
  match?: Match;
  /** Show the 'why it fits' reasons (Matched tab). Squares never show them. */
  showReasons?: boolean;
  /** The single focal card on the feed gets the hero treatment. */
  spotlight?: boolean;
  /** Bento tile size. Omit for a plain full-width row card. */
  size?: BentoSize;
};

type Ripple = { id: number; x: number; y: number; saving: boolean };

function monogram(provider: string): string {
  return provider
    .replace(/[^A-Za-z ]/g, ' ')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

export const OpportunityCard = memo(function OpportunityCard({ opportunity: o, saved, onToggleSave, match, showReasons, spotlight, size }: OpportunityCardProps) {
  const countdown = countdownFor(o);
  const hero = spotlight || size === 'featured';
  const compact = size === 'square';
  const reasonsVisible = showReasons && !compact && match && match.reasons.length > 0;

  // ── Save micro-interaction ───────────────────────────────────────────
  // rotateX/rotateY are their own motion values, so the tilt composes with
  // the hover lift (y) and press scale instead of overwriting `transform`.
  const cardRef = useRef<HTMLElement>(null);
  const rotateX = useMotionValue(0);
  const rotateY = useMotionValue(0);
  const reduceMotion = useReducedMotion();
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const [glow, setGlow] = useState(0);

  const handleSave = useCallback(
    (origin?: DOMRect) => {
      const saving = !saved;
      onToggleSave(o.id);

      const card = cardRef.current;
      if (!card) return;
      const r = card.getBoundingClientRect();
      // Press point in card space (defaults to the heart's usual top-right spot).
      const x = origin ? origin.left + origin.width / 2 - r.left : r.width - 32;
      const y = origin ? origin.top + origin.height / 2 - r.top : 32;
      setRipples((list) => [...list, { id: performance.now(), x, y, saving }]);
      if (saving) setGlow((n) => n + 1);

      if (reduceMotion) return;
      // Normalised -1…1 offset of the press from the card centre: the card
      // dips toward the finger, rebounds past level, then settles.
      const nx = (x / r.width) * 2 - 1;
      const ny = (y / r.height) * 2 - 1;
      const amp = saving ? 7 : 3.5;
      const opts = { duration: 0.8, ease: easeOut, times: [0, 0.2, 0.55, 1] };
      animate(rotateY, [0, nx * amp, -nx * amp * 0.35, 0], opts);
      animate(rotateX, [0, -ny * amp, ny * amp * 0.35, 0], opts);
    },
    [saved, onToggleSave, o.id, reduceMotion, rotateX, rotateY],
  );

  return (
    <Card
      ref={cardRef}
      interactive
      tone={hero ? 'raised' : 'default'}
      className="opp-card"
      data-size={size ?? 'row'}
      data-spotlight={hero || undefined}
      data-status={o.status}
      data-glow={glow > 0 ? glow % 2 : undefined}
      style={{ rotateX, rotateY, transformPerspective: 900 }}
    >
      <span className="opp-card__glow" aria-hidden="true" />
      {/* Decorative layer: clipped to the card, under the text, never hit-testable. */}
      <span className="opp-card__fx" aria-hidden="true">
        {hero && <span className="opp-card__aurora" />}
        <AnimatePresence>
          {ripples.map((rp) => (
            <motion.span
              key={rp.id}
              className="opp-card__ripple"
              data-saving={rp.saving || undefined}
              style={{ left: rp.x, top: rp.y }}
              initial={{ scale: 0, opacity: rp.saving ? 0.9 : 0.45 }}
              animate={{ scale: 1, opacity: 0 }}
              transition={{ duration: rp.saving ? 1.1 : 0.7, ease: easeOut }}
              onAnimationComplete={() => setRipples((list) => list.filter((x) => x.id !== rp.id))}
            />
          ))}
        </AnimatePresence>
      </span>

      <div className="opp-card__top">
        <span className="opp-card__mono" aria-hidden="true">
          {monogram(o.provider)}
        </span>
        <div className="opp-card__heading">
          {hero && (
            <p className="opp-card__kicker">
              <Sparkles aria-hidden="true" /> Spotlight
            </p>
          )}
          <p className="opp-card__provider">{o.provider}</p>
          <h3 className="opp-card__title">
            {/* Stretched link: the whole card is the hit-area, still a real link for keyboards. */}
            <Link to={`/opportunity/${o.slug}`} className="opp-card__open">
              {o.title}
            </Link>
          </h3>
        </div>
        <SaveButton saved={saved} onToggle={handleSave} label={o.title} />
      </div>

      {!compact && <p className="opp-card__summary">{o.summary}</p>}

      {reasonsVisible && (
        <ul className="opp-card__reasons" role="list" aria-label="Why it fits you">
          {match.reasons.map((r) => (
            <li key={r}>
              <Check aria-hidden="true" />
              {r}
            </li>
          ))}
        </ul>
      )}

      <div className="opp-card__meta">
        {match && (
          <span className="opp-card__match" data-strong={match.score >= MATCH_STRONG || undefined} aria-label={`${match.score}% match with your profile`}>
            {match.score}% match
          </span>
        )}
        <Tag tone={countdown.tone}>
          <CalendarClock aria-hidden="true" />
          {countdown.label}
        </Tag>
        {!compact && <Tag>{FUNDING_LABEL[o.funding]}</Tag>}
        {!compact && size !== 'tall' && (
          <Tag>
            <MapPin aria-hidden="true" />
            {o.host_country}
          </Tag>
        )}
        {o.is_pro && (
          <Tag tone="gold">
            <Lock aria-hidden="true" />
            {compact ? 'Pro' : 'Pro guide'}
          </Tag>
        )}
      </div>
    </Card>
  );
});
