import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, type PanInfo } from 'framer-motion';
import { X } from 'lucide-react';
import './Sheet.css';

export type SheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Visually hide the title (it is still announced to screen readers). */
  hideTitle?: boolean;
  children: ReactNode;
  footer?: ReactNode;
  /** 'side' = slide-over panel from the right (full height); default is the bottom sheet. */
  variant?: 'bottom' | 'side';
  /** Small line under the title. */
  description?: string;
};

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Bottom sheet (mobile) / centred dialog (wide screens), or a right-hand
 * slide-over panel with variant="side".
 * Enters with a spring from scale .94 → 1, drag-down to dismiss,
 * Escape closes, focus is trapped and restored.
 */
export function Sheet({ open, onClose, title, hideTitle, children, footer, variant = 'bottom', description }: SheetProps) {
  const side = variant === 'side';
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  // Callers pass inline functions, so read the latest through a ref. If onClose were an
  // effect dependency, every re-render (each keystroke in a form) would re-run the effect
  // and pull focus out of the field being typed in.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    returnFocus.current = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusFirst = window.setTimeout(() => {
      const first = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? panelRef.current)?.focus();
    }, 30);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const nodes = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);

    return () => {
      window.clearTimeout(focusFirst);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      returnFocus.current?.focus?.();
    };
  }, [open]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 120 || info.velocity.y > 600) onClose();
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="sheet-root" data-variant={variant}>
          <motion.div
            className="sheet-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            className="sheet"
            data-variant={variant}
            {...(side
              ? {
                  initial: { x: '100%' },
                  animate: { x: 0 },
                  exit: { x: '100%', transition: { duration: 0.22, ease: [0.4, 0, 1, 1] } },
                  transition: { type: 'spring', stiffness: 320, damping: 34 },
                }
              : {
                  initial: { opacity: 0, scale: 0.94, y: 40 },
                  animate: { opacity: 1, scale: 1, y: 0 },
                  exit: { opacity: 0, scale: 0.96, y: 40, transition: { duration: 0.18 } },
                  transition: { type: 'spring', stiffness: 380, damping: 30 },
                  drag: 'y' as const,
                  dragConstraints: { top: 0, bottom: 0 },
                  dragElastic: { top: 0, bottom: 0.6 },
                  onDragEnd,
                })}
          >
            {!side && <div className="sheet__grabber" aria-hidden="true" />}
            <header className="sheet__header">
              <div className="sheet__heading">
                <h2 id={titleId} className={hideTitle ? 'visually-hidden' : 'sheet__title'}>
                  {title}
                </h2>
                {description && <p className="sheet__desc">{description}</p>}
              </div>
              <button type="button" className="sheet__close" onClick={onClose} aria-label="Close">
                <X aria-hidden="true" />
              </button>
            </header>
            <div className="sheet__body">{children}</div>
            {footer && <footer className="sheet__footer">{footer}</footer>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
