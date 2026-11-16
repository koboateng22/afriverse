import './Backdrop.css';

/**
 * Fixed layer behind every screen, painted in the one page colour (--bg).
 * Deliberately flat: no orbs, gradients, vignette or grain, so the page reads as a
 * single continuous surface behind the sidebar and the content, with no seams.
 */
export function Backdrop() {
  return <div className="backdrop" aria-hidden="true" />;
}
