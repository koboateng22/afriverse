import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronRight, type LucideIcon } from 'lucide-react';
import { press, riseItem } from '../../lib/motion';
import './ListRow.css';

export type ListRowProps = { to?: string; onClick?: () => void; icon: LucideIcon; label: string; detail?: ReactNode; badge?: string };

const MotionLink = motion.create(Link);

/** Navigation row used in hubs and menus (progressive disclosure). */
export function ListRow({ to, onClick, icon: Icon, label, detail, badge }: ListRowProps) {
  const inner = (
    <>
      <span className="list-row__icon" aria-hidden="true">
        <Icon />
      </span>
      <span className="list-row__text">
        <span className="list-row__label">
          {label}
          {badge && <span className="list-row__badge">{badge}</span>}
        </span>
        {detail && <span className="list-row__detail">{detail}</span>}
      </span>
      <ChevronRight className="list-row__chev" aria-hidden="true" />
    </>
  );
  if (to) {
    return (
      <MotionLink to={to} className="list-row" variants={riseItem} whileTap={press}>
        {inner}
      </MotionLink>
    );
  }
  return (
    <motion.button type="button" className="list-row" variants={riseItem} whileTap={press} onClick={onClick}>
      {inner}
    </motion.button>
  );
}
