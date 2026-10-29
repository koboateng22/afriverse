import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { riseItem } from '../../lib/motion';
import './EmptyState.css';

export type EmptyStateProps = { icon: LucideIcon; title: string; children?: ReactNode; action?: ReactNode };

/** Honest empty state — explains why nothing is here and what to do next. */
export function EmptyState({ icon: Icon, title, children, action }: EmptyStateProps) {
  return (
    <motion.div className="empty" variants={riseItem} initial="hidden" animate="show">
      <span className="empty__icon" aria-hidden="true">
        <Icon />
      </span>
      <h2 className="empty__title">{title}</h2>
      {children && <div className="empty__body">{children}</div>}
      {action}
    </motion.div>
  );
}
