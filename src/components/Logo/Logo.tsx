import { Link } from 'react-router-dom';
import './Logo.css';

/** Brand mark (the Afriversity mask emblem) + wordmark. */
export function Logo({ to = '/', compact }: { to?: string; compact?: boolean }) {
  return (
    <Link to={to} className="logo" aria-label="Afriversity home">
      <picture>
        <source srcSet="/brand/emblem.webp" type="image/webp" />
        <img className="logo__mark" src="/brand/emblem.png" alt="" width="31" height="32" decoding="async" />
      </picture>
      {!compact && <span className="logo__word">Afriversity</span>}
    </Link>
  );
}

/** The emblem on its own, for loaders and hero moments. */
export function Emblem({ className, size = 64 }: { className?: string; size?: number }) {
  return (
    <picture>
      <source srcSet="/brand/emblem.webp" type="image/webp" />
      {/* INLINE: one-off dynamic size. */}
      <img className={className} src="/brand/emblem.png" alt="" aria-hidden="true" decoding="async" style={{ blockSize: size, inlineSize: 'auto' }} />
    </picture>
  );
}
