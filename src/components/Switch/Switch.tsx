import { useId } from 'react';
import { motion } from 'framer-motion';
import { spring } from '../../lib/motion';
import './Switch.css';

export type SwitchProps = {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  /** Text shown beside the switch for each state, e.g. Active / Inactive. */
  onText?: string;
  offText?: string;
  hint?: string;
};

/** Accessible on/off toggle (role="switch"). */
export function Switch({ checked, onChange, label, onText = 'On', offText = 'Off', hint }: SwitchProps) {
  const id = useId();
  return (
    <div className="switch-field">
      <div className="switch-field__text">
        <span className="switch-field__label" id={`${id}-l`}>
          {label}
        </span>
        {hint && (
          <span className="switch-field__hint" id={`${id}-h`}>
            {hint}
          </span>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-l`}
        aria-describedby={hint ? `${id}-h` : undefined}
        className="switch"
        data-on={checked || undefined}
        onClick={() => onChange(!checked)}
      >
        <span className="switch__state">{checked ? onText : offText}</span>
        <span className="switch__track" aria-hidden="true">
          <motion.span className="switch__thumb" layout transition={spring} />
        </span>
      </button>
    </div>
  );
}
