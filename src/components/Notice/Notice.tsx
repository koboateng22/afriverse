import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { CircleAlert, CircleCheck, Info } from 'lucide-react';
import './Notice.css';

export type NoticeProps = { tone?: 'info' | 'error' | 'success'; children: ReactNode; action?: ReactNode };

const ICONS = { info: Info, error: CircleAlert, success: CircleCheck };

/** Inline status message. Errors are announced (role=alert). */
export function Notice({ tone = 'info', children, action }: NoticeProps) {
  const Icon = ICONS[tone];
  return (
    <motion.div
      className="notice"
      data-tone={tone}
      role={tone === 'error' ? 'alert' : 'status'}
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <Icon className="notice__icon" aria-hidden="true" />
      <div className="notice__body">{children}</div>
      {action && <div className="notice__action">{action}</div>}
    </motion.div>
  );
}
