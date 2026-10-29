import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { press, spring } from '../../lib/motion';
import './Chip.css';

export type ChipProps = {
  selected?: boolean;
  onToggle?: () => void;
  children: ReactNode;
  icon?: ReactNode;
  /** When set, the selected highlight slides between chips sharing this id. */
  layoutGroup?: string;
  /** 'toggle' = multi-select (aria-pressed); 'radio' = single choice in a radiogroup. */
  kind?: 'toggle' | 'radio';
};

/** Selectable pill. Static (non-interactive) tags use <Tag> instead. */
export function Chip({ selected = false, onToggle, children, icon, layoutGroup, kind = 'toggle' }: ChipProps) {
  const a11y = kind === 'radio' ? { role: 'radio', 'aria-checked': selected } : { 'aria-pressed': selected };
  return (
    <motion.button
      type="button"
      className="chip"
      data-selected={selected || undefined}
      onClick={onToggle}
      whileTap={press}
      transition={spring}
      {...a11y}
    >
      {selected && layoutGroup && (
        <motion.span className="chip__highlight" layoutId={`chip-${layoutGroup}`} transition={spring} aria-hidden="true" />
      )}
      {icon}
      <span className="chip__label">{children}</span>
    </motion.button>
  );
}

export type TagProps = { children: ReactNode; tone?: 'neutral' | 'gold' | 'urgent' | 'emerald' };

/** Non-interactive label (status, field, country). */
export function Tag({ children, tone = 'neutral' }: TagProps) {
  return (
    <span className="tag" data-tone={tone}>
      {children}
    </span>
  );
}
