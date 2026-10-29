import { useId, useRef, useState, type ChangeEvent } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, FileUp, RefreshCw } from 'lucide-react';
import './FileField.css';

export type FileFieldProps = {
  label: string;
  hint?: string;
  accept: string;
  /** Called as soon as a file is picked; resolve when it's stored. */
  onUpload: (file: File) => Promise<void>;
  /** Name of the file already uploaded for this field, if any. */
  doneName?: string | null;
  error?: string | null;
};

type State = 'idle' | 'uploading' | 'done' | 'error';

/** Upload-on-select file input with clear progress, success and retry states. */
export function FileField({ label, hint, accept, onUpload, doneName, error }: FileFieldProps) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<State>(doneName ? 'done' : 'idle');
  const [message, setMessage] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(doneName ?? null);

  const pick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setState('uploading');
    setMessage(null);
    setName(file.name);
    try {
      await onUpload(file);
      setState('done');
    } catch (err) {
      setState('error');
      setMessage(err instanceof Error ? err.message : 'Upload failed — try again.');
    }
  };

  const shownError = message ?? error ?? null;

  return (
    <div className="file-field" data-state={state} data-invalid={shownError ? true : undefined}>
      <span className="field__label" id={`${id}-label`}>
        {label}
      </span>
      <input ref={input} id={id} type="file" accept={accept} className="visually-hidden" onChange={pick} aria-labelledby={`${id}-label`} aria-describedby={hint ? `${id}-hint` : undefined} />
      <motion.button type="button" className="file-field__drop" onClick={() => input.current?.click()} whileTap={{ scale: 0.98 }} disabled={state === 'uploading'} aria-describedby={`${id}-label`}>
        {state === 'done' ? (
          <CheckCircle2 className="file-field__icon" aria-hidden="true" />
        ) : state === 'uploading' ? (
          <FileUp className="file-field__icon" data-uploading aria-hidden="true" />
        ) : (
          <FileUp className="file-field__icon" aria-hidden="true" />
        )}
        <span className="file-field__text">
          <span className="file-field__main">
            {state === 'uploading' ? 'Uploading…' : state === 'done' ? name ?? 'Uploaded' : 'Choose a file'}
          </span>
          <span className="file-field__sub">{state === 'done' ? 'Uploaded — tap to replace' : 'PDF or photo, up to 10 MB'}</span>
        </span>
        {state === 'done' && <RefreshCw className="file-field__replace" aria-hidden="true" />}
      </motion.button>
      {hint && !shownError && (
        <p className="field__hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {shownError && (
        <p className="field__error" role="alert">
          {shownError}
        </p>
      )}
    </div>
  );
}
