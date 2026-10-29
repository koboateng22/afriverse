import './Backdrop.css';

export type BackdropProps = {
  /** 'hero' = brighter orbs for landing/signup; 'quiet' = app screens; 'vip' = the Pro paywall. */
  tone?: 'hero' | 'quiet' | 'vip';
};

/**
 * Fixed decorative layer behind every screen: soft, slow-drifting gradient
 * orbs (emerald, gold, terracotta) on Ink. No lines, no patterns — only
 * transform/opacity animate, so it stays cheap on low-end phones.
 */
export function Backdrop({ tone = 'quiet' }: BackdropProps) {
  return (
    <div className="backdrop" data-tone={tone} aria-hidden="true">
      <span className="backdrop__orb" data-orb="emerald" />
      <span className="backdrop__orb" data-orb="gold" />
      <span className="backdrop__orb" data-orb="terracotta" />
      <span className="backdrop__orb" data-orb="deep" />
      <span className="backdrop__vignette" />
      {/* VIP layer: always mounted so it can cross-fade in/out with the route. */}
      <span className="backdrop__vip">
        <span className="backdrop__aurora" data-aurora="emerald" />
        <span className="backdrop__aurora" data-aurora="gold" />
      </span>
    </div>
  );
}

/** App-wide SVG film grain at 3% opacity, stepped jitter. */
export function GrainOverlay() {
  return (
    <svg className="grain" aria-hidden="true" focusable="false">
      <filter id="afv-grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" stitchTiles="stitch" />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter="url(#afv-grain)" />
    </svg>
  );
}
