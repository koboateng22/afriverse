import type { Transition, Variants } from 'framer-motion';

// Mirrors --ease-out / --ease-spring in tokens.css so JS and CSS motion match.
export const easeOut = [0.16, 1, 0.3, 1] as const;

export const spring: Transition = { type: 'spring', stiffness: 420, damping: 32, mass: 0.9 };
export const softSpring: Transition = { type: 'spring', stiffness: 260, damping: 26 };

/** Route crossfade (both screens overlap; see <PageTransition>): a 150ms opacity fade. */
export const pageVariants: Variants = {
  initial: { opacity: 0 },
  enter: { opacity: 1, transition: { duration: 0.15 } },
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
