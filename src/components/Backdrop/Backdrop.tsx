import './Backdrop.css';

/**
 * Fixed layer behind every screen: the page colour (--bg) with a faint adinkra texture.
 * No orbs, gradients or vignette, so the page reads as one continuous surface behind
 * the sidebar and the content, with no seams.
 */
export function Backdrop() {
  return <div className="backdrop" aria-hidden="true" />;
}
