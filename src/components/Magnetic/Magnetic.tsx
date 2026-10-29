import { useEffect, useRef, type ReactNode } from 'react';
import { motion, useMotionValue, useReducedMotion, useSpring } from 'framer-motion';
import './Magnetic.css';

export type MagneticProps = {
  children: ReactNode;
  /** Fraction of the pointer's offset the element travels (0–1). */
  strength?: number;
  /** How far outside the element's edges (px) the pull starts. */
  radius?: number;
  /** Max travel in px, so the element never drifts away from its label/neighbours. */
  max?: number;
  className?: string;
};

/**
 * Magnetic pull: while a fine pointer is near, the child eases toward it on
 * a spring; when the pointer leaves, it springs home.
 *
 * Listens on `window` rather than enlarging the hit area, so the invisible
 * "field" never overlaps or blocks neighbouring controls. Also exposes the
 * pointer position as --mx/--my for a sheen that follows the cursor.
 * Off for touch and for prefers-reduced-motion.
 */
export function Magnetic({ children, strength = 0.32, radius = 90, max = 14, className }: MagneticProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const tx = useMotionValue(0);
  const ty = useMotionValue(0);
  const x = useSpring(tx, { stiffness: 260, damping: 18, mass: 0.6 });
  const y = useSpring(ty, { stiffness: 260, damping: 18, mass: 0.6 });

  useEffect(() => {
    const el = ref.current;
    if (!el || reduce || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

    let frame = 0;
    let last: PointerEvent | null = null;
    const clamp = (v: number) => Math.max(-max, Math.min(max, v));

    const update = () => {
      frame = 0;
      if (!last) return;
      const r = el.getBoundingClientRect();
      // Rect without the current translation, so the field doesn't chase itself.
      const left = r.left - x.get();
      const top = r.top - y.get();
      const dx = last.clientX - (left + r.width / 2);
      const dy = last.clientY - (top + r.height / 2);
      // Distance from the nearest edge (0 when inside).
      const ex = Math.max(0, Math.abs(dx) - r.width / 2);
      const ey = Math.max(0, Math.abs(dy) - r.height / 2);
      const edge = Math.hypot(ex, ey);

      if (edge > radius) {
        tx.set(0);
        ty.set(0);
        el.removeAttribute('data-near');
        return;
      }
      const falloff = 1 - edge / radius; // 1 at the edge/inside → 0 at the field's rim
      tx.set(clamp(dx * strength * falloff));
      ty.set(clamp(dy * strength * falloff));
      el.setAttribute('data-near', '');
      el.style.setProperty('--mx', `${last.clientX - left}px`);
      el.style.setProperty('--my', `${last.clientY - top}px`);
    };

    const onMove = (e: PointerEvent) => {
      last = e;
      if (!frame) frame = requestAnimationFrame(update);
    };
    const reset = () => {
      last = null;
      tx.set(0);
      ty.set(0);
      el.removeAttribute('data-near');
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', reset);
    window.addEventListener('blur', reset);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', reset);
      window.removeEventListener('blur', reset);
    };
  }, [reduce, strength, radius, max, tx, ty, x, y]);

  return (
    <motion.div ref={ref} className={className ? `magnetic ${className}` : 'magnetic'} style={{ x, y }}>
      {children}
    </motion.div>
  );
}
