import type { MouseEvent } from 'react';
import { motion } from 'framer-motion';
import { Heart } from 'lucide-react';
import './SaveButton.css';

export type SaveButtonProps = {
  saved: boolean;
  /** Receives the button's on-screen rect so a parent card can tilt/ripple from that point. */
  onToggle: (origin?: DOMRect) => void;
  label: string;
};

/** Heart toggle: spring squash on press, heart-pop + double pulse ring on save. */
export function SaveButton({ saved, onToggle, label }: SaveButtonProps) {
  const click = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    onToggle(e.currentTarget.getBoundingClientRect());
  };

  return (
    <motion.button
      type="button"
      className="save-btn"
      data-saved={saved || undefined}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${label} from saved` : `Save ${label}`}
      whileHover={{ scale: 1.06 }}
      whileTap={{ scale: 0.82 }}
      transition={{ type: 'spring', stiffness: 520, damping: 14 }}
      onClick={click}
    >
      {/* key change remounts the icon so the pop replays on every save */}
      <Heart key={saved ? 'on' : 'off'} className="save-btn__icon" aria-hidden="true" />
      {saved && (
        <>
          <span className="save-btn__burst" aria-hidden="true" />
          <span className="save-btn__burst" data-late aria-hidden="true" />
        </>
      )}
    </motion.button>
  );
}
