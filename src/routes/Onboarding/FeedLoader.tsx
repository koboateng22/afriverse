import { motion } from 'framer-motion';
import { CardSkeleton } from '../../components/Skeleton/Skeleton';
import { Emblem } from '../../components/Logo/Logo';
import { riseItem, staggerParent } from '../../lib/motion';
import './Onboarding.css';

/** The last onboarding beat: shown while the profile saves, then hands off to /home. */
export function FeedLoader({ field }: { field: string }) {
  return (
    <motion.main className="screen feed-loader" data-bare initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="status" aria-live="polite">
      <div className="container feed-loader__inner">
        <div className="feed-loader__orb" aria-hidden="true">
          <span className="feed-loader__ring" />
          <span className="feed-loader__ring" data-delay="1" />
          <span className="feed-loader__ring" data-delay="2" />
          <Emblem className="feed-loader__mark" size={56} />
        </div>
        <motion.div className="feed-loader__copy" variants={staggerParent} initial="hidden" animate="show">
          <motion.h1 variants={riseItem}>Building your feed</motion.h1>
          <motion.p variants={riseItem}>Matching opportunities to {field || 'your interests'}…</motion.p>
        </motion.div>
        <motion.div className="feed-loader__cards" variants={staggerParent} initial="hidden" animate="show">
          {[0, 1, 2].map((i) => (
            <motion.div key={i} variants={riseItem}>
              <CardSkeleton index={i} />
            </motion.div>
          ))}
        </motion.div>
      </div>
    </motion.main>
  );
}
