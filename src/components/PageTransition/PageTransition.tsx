import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { motion, useIsPresent, useReducedMotion } from 'framer-motion';
import { pageVariants, pageVariantsReduced } from '../../lib/motion';

export type PageTransitionProps = {
  children: ReactNode;
  className?: string;
  /** Hide the bottom-nav spacing (auth, onboarding, landing). */
  bare?: boolean;
  label?: string;
};

/**
 * Wraps every route. The router's <AnimatePresence> runs in "sync" mode, so
 * the old and new screens are on stage together for a true crossfade.
 *
 * The leaving screen is pinned with `position: fixed` at the scroll offset it
 * was left at: it drops out of document flow (no height jump, the new page
 * starts at the top) yet stays visually exactly where the user last saw it
 * while it dissolves. It is also inert + hidden from assistive tech, so only
 * one <main> is ever exposed.
 */
export function PageTransition({ children, className, bare, label }: PageTransitionProps) {
  const isPresent = useIsPresent();
  const reduce = useReducedMotion();
  const lastScroll = useRef(0);
  const pinnedTop = useRef<number | null>(null);

  useEffect(() => {
    if (!isPresent) return;
    const track = () => {
      lastScroll.current = window.scrollY;
    };
    track();
    window.addEventListener('scroll', track, { passive: true });
    return () => window.removeEventListener('scroll', track);
  }, [isPresent]);

  // Freeze the offset the first render after exit begins; later re-renders reuse it.
  if (!isPresent && pinnedTop.current === null) pinnedTop.current = -lastScroll.current;

  const leaving: CSSProperties | undefined = isPresent
    ? undefined
    : { position: 'fixed', insetInline: 0, insetBlockStart: pinnedTop.current ?? 0, zIndex: 0, pointerEvents: 'none' };

  return (
    <motion.main
      className={className ? `screen ${className}` : 'screen'}
      data-bare={bare || undefined}
      data-leaving={isPresent ? undefined : true}
      aria-label={label}
      aria-hidden={isPresent ? undefined : true}
      // `inert` is a valid HTML attribute; React 18 needs it as an empty string.
      {...(isPresent ? {} : { inert: '' })}
      style={leaving}
      variants={reduce ? pageVariantsReduced : pageVariants}
      initial="initial"
      animate="enter"
      exit="exit"
    >
      {children}
    </motion.main>
  );
}
