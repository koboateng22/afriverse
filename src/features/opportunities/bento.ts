import { useLayoutEffect, useState } from 'react';

/** Tile sizes on the Discover bento grid (cols × rows). */
export type BentoSize = 'featured' | 'wide' | 'tall' | 'square';

const SPAN: Record<BentoSize, readonly [cols: number, rows: number]> = {
  featured: [2, 2],
  wide: [2, 1],
  tall: [1, 2],
  square: [1, 1],
};

/** Visual rhythm after the featured tile: big, small, small, wide, small, small, … */
const RHYTHM: BentoSize[] = ['tall', 'square', 'square', 'wide', 'square', 'tall', 'square', 'wide', 'square', 'square'];

/**
 * Assigns a tile size to every item so that CSS Grid's default (sparse)
 * auto-placement packs them with no holes, at any column count.
 *
 * Why not `grid-auto-flow: dense`? Dense backfills gaps by moving later
 * items earlier, so visual order stops matching DOM order — keyboard and
 * screen-reader users would hear the cards in a different sequence than
 * sighted users see them (WCAG 1.3.2 / 2.4.3). Instead we simulate the
 * sparse algorithm and only shrink a tile when its preferred size would
 * leave a gap. Every item lands exactly on the first empty cell, so DOM
 * order == reading order.
 */
export function packBento(count: number, cols: number, featuredIndex: number | null): BentoSize[] {
  const sizes = pack(count, cols, featuredIndex, 'featured');
  // Very short lists can't surround a 2×2 tile; a wide hero reads better than a gap.
  return featuredIndex !== null && gapsAboveLastRow(sizes, cols) > 0 ? pack(count, cols, featuredIndex, 'wide') : sizes;
}

/** Independent re-run of CSS sparse auto-placement; counts empty cells above the last row. */
export function gapsAboveLastRow(sizes: BentoSize[], cols: number): number {
  const taken = new Set<string>();
  let row = 0;
  let col = 0;
  let last = 0;
  for (const s of sizes) {
    const w = Math.min(SPAN[s][0], cols);
    const h = SPAN[s][1];
    for (;;) {
      if (col + w > cols) {
        row += 1;
        col = 0;
        continue;
      }
      let fits = true;
      for (let dr = 0; dr < h && fits; dr += 1) for (let dc = 0; dc < w; dc += 1) if (taken.has(`${row + dr}:${col + dc}`)) fits = false;
      if (fits) break;
      col += 1;
    }
    for (let dr = 0; dr < h; dr += 1) for (let dc = 0; dc < w; dc += 1) taken.add(`${row + dr}:${col + dc}`);
    last = Math.max(last, row + h - 1);
    col += w;
  }
  let gaps = 0;
  for (let r = 0; r < last; r += 1) for (let c = 0; c < cols; c += 1) if (!taken.has(`${r}:${c}`)) gaps += 1;
  return gaps;
}

function pack(count: number, cols: number, featuredIndex: number | null, hero: 'featured' | 'wide'): BentoSize[] {
  if (count === 0) return [];
  if (cols < 2) return Array.from({ length: count }, () => 'square');

  const taken = new Set<string>();
  const key = (r: number, c: number) => `${r}:${c}`;
  const free = (r: number, c: number) => c < cols && !taken.has(key(r, c));
  let row = 0;
  let col = 0;
  let beat = 0;
  const sizes: BentoSize[] = [];

  const advance = () => {
    while (!free(row, col)) {
      col += 1;
      if (col >= cols) {
        col = 0;
        row += 1;
      }
    }
  };

  for (let i = 0; i < count; i += 1) {
    advance();
    // Contiguous free cells from the cursor to the next occupied cell / row end.
    let run = 0;
    while (free(row, col + run)) run += 1;

    let want: BentoSize = i === featuredIndex ? hero : RHYTHM[beat++ % RHYTHM.length];
    const remaining = count - i - 1;

    // A 2-wide tile can't fit in a 1-cell gap: shrink instead of skipping (skipping = hole).
    if (SPAN[want][0] > run) want = want === 'featured' ? 'tall' : 'square';
    // A tall tile near the end would leave the last row ragged; keep it square.
    if (want === 'tall' && remaining < cols - 1) want = 'square';
    // Last item: stretch to close the final row when there is exactly room for a wide tile.
    if (remaining === 0 && want === 'square' && run === 2 && row > 0) want = 'wide';

    const [w, h] = SPAN[want];
    for (let dr = 0; dr < h; dr += 1) for (let dc = 0; dc < w; dc += 1) taken.add(key(row + dr, col + dc));
    sizes.push(want);
    col += w;
  }
  return sizes;
}

/**
 * Column count of a CSS grid, read from its computed `grid-template-columns`
 * so the breakpoints live in CSS only. Takes the element itself (from a
 * callback ref) because the grid remounts whenever the filter changes.
 */
export function useGridColumns(el: HTMLElement | null, fallback = 2): number {
  const [cols, setCols] = useState(fallback);
  useLayoutEffect(() => {
    if (!el) return;
    const measure = () => {
      const tracks = getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length;
      setCols(tracks || fallback);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el, fallback]);
  return cols;
}
