import { useRef } from 'react';
import { motion, useReducedMotion, useScroll, useTransform, type MotionValue } from 'framer-motion';

/**
 * Scroll-linked parallax for a screen header.
 * As the header scrolls off the top (progress 0 → 1):
 *   art   drifts down 45% of its height (moves slower than the page → depth)
 *   text  rises a little faster than the page and dims slightly near the end
 * The text never drops below 55% opacity while any of it is still on screen,
 * which keeps even the lede above AA on the Ink background.
 */
export function useHeaderParallax() {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const artY = useTransform(scrollYProgress, [0, 1], ['0%', reduce ? '0%' : '45%']);
  const artScale = useTransform(scrollYProgress, [0, 1], [1, reduce ? 1 : 1.08]);
  const textY = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : -28]);
  const textOpacity = useTransform(scrollYProgress, [0, 0.35, 1], [1, 1, 0.55]);
  return { ref, artY, artScale, textY, textOpacity };
}

/**
 * The header "image": a soft emerald/gold aurora with the Afriversity emblem
 * as a large watermark. Purely decorative (aria-hidden, z-index -1, no pointer
 * events) and masked to fade out before it reaches the content below.
 */
export function HeaderArt({ y, scale, tone = 'default' }: { y: MotionValue<string>; scale: MotionValue<number>; tone?: 'default' | 'gold' }) {
  return (
    <div className="header-art" data-tone={tone} aria-hidden="true">
      <motion.div className="header-art__layer" style={{ y, scale }}>
        <span className="header-art__aurora" />
        <img className="header-art__emblem" src="/brand/emblem.webp" alt="" decoding="async" loading="lazy" />
      </motion.div>
    </div>
  );
}
