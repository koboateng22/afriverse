import type { CSSProperties, ReactNode } from 'react';
import type { BentoSize } from '../../features/opportunities/bento';
import './Skeleton.css';

export type SkeletonProps = {
  width?: string;
  height?: string;
  shape?: 'line' | 'block' | 'circle' | 'pill';
  label?: string;
};

/**
 * A single placeholder "bone". Standalone bones carry their own shimmer;
 * bones inside a <SkeletonTile> stay still and the tile's glint sweeps
 * over them all at once (one light source reads calmer than twenty).
 * Shown while real data loads — never as fake content.
 */
export function Skeleton({ width = '100%', height, shape = 'line', label }: SkeletonProps) {
  return (
    <span
      className="skeleton"
      data-shape={shape}
      role={label ? 'status' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      // INLINE: dynamic size is a one-off value.
      style={{ inlineSize: width, blockSize: height }}
    />
  );
}

/** Glass tile that hosts bones; `index` staggers the glint so a list shimmers as a wave. */
type SkeletonTileProps = { children: ReactNode; index?: number; className?: string; size?: BentoSize; side?: 'assistant' | 'user' };

export function SkeletonTile({ children, index = 0, className, size, side }: SkeletonTileProps) {
  return (
    <div
      className={className ? `skeleton-tile ${className}` : 'skeleton-tile'}
      data-size={size}
      data-side={side}
      aria-hidden="true"
      // INLINE: per-tile stagger offset.
      style={{ '--i': index } as CSSProperties}
    >
      {children}
    </div>
  );
}

/** Wrapper that announces the loading state once for a whole group of tiles. */
function SkeletonGroup({ label, className, children }: { label: string; className: string; children: ReactNode }) {
  return (
    <div className={className} role="status" aria-busy="true" aria-label={label}>
      <span className="visually-hidden">{label}…</span>
      {children}
    </div>
  );
}

/** Opportunity row card (feed fallback, onboarding loader, mentor lists). */
export function CardSkeleton({ index = 0 }: { index?: number }) {
  return (
    <SkeletonTile index={index}>
      <div className="skeleton-tile__row">
        <Skeleton shape="block" width="44px" height="44px" />
        <div className="skeleton-tile__lines">
          <Skeleton width="40%" height="10px" />
          <Skeleton width="85%" height="16px" />
        </div>
      </div>
      <Skeleton width="100%" height="10px" />
      <Skeleton width="62%" height="10px" />
      <div className="skeleton-tile__tags">
        <Skeleton shape="pill" width="96px" height="22px" />
        <Skeleton shape="pill" width="72px" height="22px" />
      </div>
    </SkeletonTile>
  );
}

const BENTO_SHAPES: BentoSize[] = ['featured', 'tall', 'square', 'square', 'wide', 'square', 'square'];

/** Discover bento: same spans as the real grid, so nothing jumps when data lands. */
export function BentoSkeleton({ label = 'Loading' }: { label?: string }) {
  return (
    <SkeletonGroup label={label} className="bento">
      {BENTO_SHAPES.map((size, i) => (
        <SkeletonTile key={i} index={i} size={size}>
          <div className="skeleton-tile__row" data-split>
            <Skeleton shape="block" width={size === 'featured' ? '52px' : '40px'} height={size === 'featured' ? '52px' : '40px'} />
            <Skeleton shape="circle" width="44px" height="44px" />
          </div>
          <div className="skeleton-tile__lines">
            <Skeleton width="45%" height="10px" />
            <Skeleton width="92%" height={size === 'featured' ? '26px' : '14px'} />
            {size !== 'square' && <Skeleton width="70%" height={size === 'featured' ? '26px' : '14px'} />}
          </div>
          {(size === 'featured' || size === 'tall' || size === 'wide') && (
            <div className="skeleton-tile__lines">
              <Skeleton width="100%" height="10px" />
              <Skeleton width="80%" height="10px" />
            </div>
          )}
          <div className="skeleton-tile__tags">
            <Skeleton shape="pill" width="84px" height="22px" />
            {size !== 'square' && <Skeleton shape="pill" width="64px" height="22px" />}
          </div>
        </SkeletonTile>
      ))}
    </SkeletonGroup>
  );
}

/** Course card: 16:9 thumbnail + text. */
export function CourseCardSkeleton({ index = 0 }: { index?: number }) {
  return (
    <SkeletonTile index={index} className="skeleton-tile--media">
      <span className="skeleton-tile__media" />
      <div className="skeleton-tile__body">
        <Skeleton width="34%" height="10px" />
        <Skeleton width="80%" height="16px" />
        <Skeleton width="100%" height="10px" />
        <Skeleton width="55%" height="10px" />
      </div>
    </SkeletonTile>
  );
}

/** Mentor row: avatar, name, headline, tags, rate. */
export function MentorCardSkeleton({ index = 0 }: { index?: number }) {
  return (
    <SkeletonTile index={index} className="skeleton-tile--inline">
      <Skeleton shape="circle" width="52px" height="52px" />
      <div className="skeleton-tile__lines" data-grow>
        <Skeleton width="48%" height="14px" />
        <Skeleton width="78%" height="10px" />
        <div className="skeleton-tile__tags">
          <Skeleton shape="pill" width="64px" height="20px" />
          <Skeleton shape="pill" width="52px" height="20px" />
        </div>
      </div>
      <Skeleton shape="pill" width="64px" height="14px" />
    </SkeletonTile>
  );
}

/** Concierge application: titles + status pill, copy, 4-step timeline, fee rows. */
export function ApplicationCardSkeleton({ index = 0 }: { index?: number }) {
  return (
    <SkeletonTile index={index}>
      <div className="skeleton-tile__row" data-split>
        <div className="skeleton-tile__lines" data-grow>
          <Skeleton width="38%" height="10px" />
          <Skeleton width="72%" height="18px" />
        </div>
        <Skeleton shape="pill" width="74px" height="22px" />
      </div>
      <Skeleton width="86%" height="10px" />
      <div className="skeleton-tile__timeline">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="skeleton-tile__step">
            <Skeleton shape="circle" width="28px" height="28px" />
            <Skeleton width="70%" height="8px" />
          </span>
        ))}
      </div>
      <div className="skeleton-tile__rule" />
      <div className="skeleton-tile__row" data-split>
        <Skeleton width="42%" height="10px" />
        <Skeleton width="22%" height="10px" />
      </div>
    </SkeletonTile>
  );
}

/** Chat history loading: alternating bubbles. */
export function ChatSkeleton() {
  return (
    <SkeletonGroup label="Loading your conversation" className="skeleton-chat">
      <SkeletonTile index={0} className="skeleton-bubble" side="assistant">
        <Skeleton width="92%" height="10px" />
        <Skeleton width="64%" height="10px" />
      </SkeletonTile>
      <SkeletonTile index={1} className="skeleton-bubble" side="user">
        <Skeleton width="80%" height="10px" />
      </SkeletonTile>
      <SkeletonTile index={2} className="skeleton-bubble" side="assistant">
        <Skeleton width="96%" height="10px" />
        <Skeleton width="88%" height="10px" />
        <Skeleton width="42%" height="10px" />
      </SkeletonTile>
    </SkeletonGroup>
  );
}

/** Pro pricing card while the plan loads. */
export function ProOfferSkeleton() {
  return (
    <SkeletonGroup label="Loading Pro" className="skeleton-stack">
      <SkeletonTile index={0}>
        <div className="skeleton-tile__row" data-split>
          <Skeleton shape="pill" width="56px" height="26px" />
          <Skeleton width="40%" height="34px" />
        </div>
        {[92, 80, 86, 70].map((w) => (
          <Skeleton key={w} width={`${w}%`} height="12px" />
        ))}
      </SkeletonTile>
      <SkeletonTile index={1}>
        <Skeleton width="50%" height="14px" />
        <Skeleton width="80%" height="10px" />
      </SkeletonTile>
      <Skeleton shape="pill" height="56px" />
    </SkeletonGroup>
  );
}

/** Generic stack of tiles for list screens (Courses, Mentors, Applications). */
export function ListSkeleton({ label, count = 3, kind, className = 'skeleton-stack' }: { label: string; count?: number; kind: 'card' | 'course' | 'mentor' | 'application'; className?: string }) {
  const Tile = { card: CardSkeleton, course: CourseCardSkeleton, mentor: MentorCardSkeleton, application: ApplicationCardSkeleton }[kind];
  return (
    <SkeletonGroup label={label} className={className}>
      {Array.from({ length: count }, (_, i) => (
        <Tile key={i} index={i} />
      ))}
    </SkeletonGroup>
  );
}

/** Whole-screen placeholder: header bones + a few tiles. Replaces the old spinner loader. */
export function ScreenSkeleton({ label }: { label: string }) {
  return (
    <div className="skeleton-screen container" role="status" aria-busy="true" aria-live="polite">
      <div className="skeleton-screen__header">
        <Skeleton width="28%" height="10px" />
        <Skeleton width="72%" height="34px" />
        <Skeleton width="54%" height="34px" />
      </div>
      <p className="skeleton-screen__label">
        <span className="skeleton-screen__dot" aria-hidden="true" />
        {label}
      </p>
      <div className="skeleton-stack" aria-hidden="true">
        <CardSkeleton index={0} />
        <CardSkeleton index={1} />
        <CardSkeleton index={2} />
      </div>
    </div>
  );
}
