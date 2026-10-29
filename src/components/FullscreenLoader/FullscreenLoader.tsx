import { motion } from 'framer-motion';
import { ScreenSkeleton } from '../Skeleton/Skeleton';

/**
 * Route-level wait (lazy chunks, session checks, payment confirmation):
 * a glass skeleton of a screen with the status line on top — no spinner.
 * Fades in after 150ms so fast loads never flash it.
 */
export function FullscreenLoader({ label }: { label: string }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15, duration: 0.3 }}>
      <ScreenSkeleton label={label} />
    </motion.div>
  );
}
