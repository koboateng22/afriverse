import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import './Field.css';

type FieldShell = {
  label: string;
  hint?: string;
  error?: string | null;
  icon?: ReactNode;
};

function useFieldIds(id?: string) {
  const auto = useId();
  const inputId = id ?? auto;
  return { inputId, hintId: `${inputId}-hint`, errorId: `${inputId}-error` };
}

function describedBy(hint: string | undefined, error: string | null | undefined, ids: { hintId: string; errorId: string }) {
  return [hint ? ids.hintId : null, error ? ids.errorId : null].filter(Boolean).join(' ') || undefined;
}

function Shell({ label, hint, error, icon, inputId, hintId, errorId, children }: FieldShell & ReturnType<typeof useFieldIds> & { children: ReactNode }) {
  return (
    <div className="field" data-invalid={error ? true : undefined}>
      <label className="field__label" htmlFor={inputId}>{label}</label>
      <div className="field__control">
        {icon && <span className="field__icon" aria-hidden="true">{icon}</span>}
        {children}
      </div>
      {hint && !error && <p className="field__hint" id={hintId}>{hint}</p>}
      {error && <p className="field__error" id={errorId} role="alert">{error}</p>}
    </div>
  );
}

export type FieldProps = FieldShell & InputHTMLAttributes<HTMLInputElement>;

/** Labelled text input with hint + error wiring (aria-describedby / aria-invalid). */
export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field({ label, hint, error, icon, id, ...rest }, ref) {
  const ids = useFieldIds(id);
  return (
    <Shell label={label} hint={hint} error={error} icon={icon} {...ids}>
      <input
        ref={ref}
        id={ids.inputId}
        className="field__input"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(hint, error, ids)}
        {...rest}
      />
    </Shell>
  );
});

export type SelectFieldProps = FieldShell & SelectHTMLAttributes<HTMLSelectElement> & { options: readonly string[]; placeholder?: string };

export function SelectField({ label, hint, error, icon, id, options, placeholder, ...rest }: SelectFieldProps) {
  const ids = useFieldIds(id);
  return (
    <Shell label={label} hint={hint} error={error} icon={icon} {...ids}>
      <select
        id={ids.inputId}
        className="field__input field__select"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(hint, error, ids)}
        {...rest}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </Shell>
  );
}

export type TextAreaFieldProps = FieldShell & TextareaHTMLAttributes<HTMLTextAreaElement>;

export function TextAreaField({ label, hint, error, icon, id, ...rest }: TextAreaFieldProps) {
  const ids = useFieldIds(id);
  return (
    <Shell label={label} hint={hint} error={error} icon={icon} {...ids}>
      <textarea
        id={ids.inputId}
        className="field__input field__textarea"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(hint, error, ids)}
        {...rest}
      />
    </Shell>
  );
}
