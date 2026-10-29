import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { PageTransition } from '../../components/PageTransition/PageTransition';
import { Logo } from '../../components/Logo/Logo';
import { riseItem, staggerParent } from '../../lib/motion';
import './AuthLayout.css';

export type AuthLayoutProps = {
  eyebrow: string;
  title: string;
  lede?: string;
  children: ReactNode;
  footer?: ReactNode;
};

export function AuthLayout({ eyebrow, title, lede, children, footer }: AuthLayoutProps) {
  return (
    <PageTransition bare label={title}>
      <div className="container auth">
        <header className="auth__bar">
          <Logo />
        </header>
        <motion.div className="auth__body" variants={staggerParent} initial="hidden" animate="show">
          <motion.p className="eyebrow" variants={riseItem}>
            {eyebrow}
          </motion.p>
          <motion.h1 className="auth__title" variants={riseItem}>
            {title}
          </motion.h1>
          {lede && (
            <motion.p className="auth__lede" variants={riseItem}>
              {lede}
            </motion.p>
          )}
          <motion.div variants={riseItem}>{children}</motion.div>
          {footer && (
            <motion.div className="auth__footer" variants={riseItem}>
              {footer}
            </motion.div>
          )}
        </motion.div>
      </div>
    </PageTransition>
  );
}
