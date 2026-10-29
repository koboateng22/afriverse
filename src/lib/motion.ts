import type { Transition, Variants } from 'framer-motion';

// Mirrors --ease-out / --ease-spring in tokens.css so JS and CSS motion match.
export const easeOut = [0.16, 1, 0.3, 1] as const;

export const spring: Transition = { type: 'spring', stiffness: 420, damping: 32, mass: 0.9 };
export const softSpring: Transition = { type: 'spring', stiffness: 260, damping: 26 };

/**
 * Cinematic route crossfade (both screens overlap; see <PageTransition>).
 * Incoming: fades up from a slight zoom + soft focus pull. Outgoing: recedes
 * and defocuses faster, so the new screen owns the frame by mid-transition.
 * `transitionEnd` clears filter/transform completely: a lingering
 * `filter: blur(0px)` would make <main> a containing block for fixed children
 * and a backdrop root that stops the glass cards frosting the backdrop.
 */
export const pageVariants: Variants = {
  initial: { opacity: 0, scale: 1.012, y: 6, filter: 'blur(6px)' },
  enter: {
    opacity: 1,
    scale: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { duration: 0.48, ease: easeOut, opacity: { duration: 0.36, ease: easeOut, delay: 0.04 } },
    transitionEnd: { filter: 'none' },
  },
  exit: { opacity: 0, scale: 0.985, filter: 'blur(4px)', transition: { duration: 0.28, ease: [0.4, 0, 1, 1] } },
};

/** Reduced motion: opacity-only crossfade, no zoom or blur. */
export const pageVariantsReduced: Variants = {
  initial: { opacity: 0 },
  enter: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

/** Parent that staggers children 60ms apart on page load. */
export const staggerParent: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
};

/** Child item for staggerParent. */
export const riseItem: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.42, ease: easeOut } },
};

/** Shared press feedback: scale(.97). */
export const press = { scale: 0.97 } as const;

/** Shared hover lift: translateY(-4px). Shadow bloom is paired in CSS :hover. */
export const lift = { y: -4 } as const;
