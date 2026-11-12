import { useState } from 'react';
import type { University } from './types';
import './UniLogo.css';

const SMALL_WORDS = new Set(['of', 'the', 'and', 'for', 'de', 'la', 'du']);

/** "UG", "KNUST", or initials from the name ("Central University" → "CU"), at most 6 characters. */
export function monogramOf(u: Pick<University, 'name' | 'short_name'>): string {
  const short = u.short_name?.trim();
  if (short && short.length <= 6) return short;
  return u.name
    .split(/\s+/)
    .filter((w) => w && !SMALL_WORDS.has(w.toLowerCase()))
    .map((w) => w[0]!.toUpperCase())
    .join('')
    .slice(0, 4);
}

/**
 * The university's logo in a fixed square, or its initials on the brand green
 * when there is no logo or it fails to load. Both states are the same size, so
 * the card layout never shifts.
 */
export function UniLogo({ u, size = 'md' }: { u: Pick<University, 'name' | 'short_name' | 'logo_url'>; size?: 'md' | 'lg' }) {
  const [failed, setFailed] = useState(false);
  const mono = monogramOf(u);
  const showImage = Boolean(u.logo_url) && !failed;
  return (
    <span className="uni-logo" data-size={size} data-kind={showImage ? 'image' : 'mono'} data-long={!showImage && mono.length > 3 ? '' : undefined} aria-hidden="true">
      {showImage ? <img src={u.logo_url!} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} /> : mono}
    </span>
  );
}
