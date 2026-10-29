import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { riseItem, staggerParent } from '../../lib/motion';
import { HeaderArt, useHeaderParallax } from './HeaderArt';
import './PageHeader.css';

export type PageHeaderProps = {
  title: string;
  eyebrow?: string;
  lede?: ReactNode;
  back?: { to: string; label: string };
  aside?: ReactNode;
  /** Header image tint. Paywall uses gold. */
  artTone?: 'default' | 'gold';
};

/** Screen title block: optional back link, eyebrow, H1, lede. Staggers in on load; parallax on scroll. */
export function PageHeader({ title, eyebrow, lede, back, aside, artTone }: PageHeaderProps) {
  const { ref, artY, artScale, textY, textOpacity } = useHeaderParallax();

  return (
    <motion.header ref={ref} className="page-header" variants={staggerParent} initial="hidden" animate="show">
      <HeaderArt y={artY} scale={artScale} tone={artTone} />
      <motion.div className="page-header__inner" style={{ y: textY, opacity: textOpacity }}>
        {back && (
          <motion.div variants={riseItem}>
            <Link to={back.to} className="page-header__back">
              <ArrowLeft aria-hidden="true" />
              {back.label}
            </Link>
          </motion.div>
        )}
        <div className="page-header__row">
          <div className="page-header__text">
            {eyebrow && (
              <motion.p className="eyebrow" variants={riseItem}>
                {eyebrow}
              </motion.p>
            )}
            <motion.h1 className="page-header__title" variants={riseItem}>
              {title}
            </motion.h1>
            {lede && (
              <motion.p className="page-header__lede" variants={riseItem}>
                {lede}
              </motion.p>
            )}
          </div>
          {aside && <motion.div variants={riseItem}>{aside}</motion.div>}
        </div>
      </motion.div>
    </motion.header>
  );
}
