import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Sparkles, X } from 'lucide-react';
import { formatDay } from '../../lib/dates';
import { usePlan } from './PlanProvider';
import './RenewalBanner.css';

const DISMISS_KEY = 'afv-upsell-dismissed';
const DAY = 86_400_000;

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * The single upsell slot on /home:
 *  - Pro ended → "renew" (always shown)
 *  - Pro ending within 3 days and NOT auto-renewing → heads-up
 *  - never subscribed → a dismissible nudge
 */
export function RenewalBanner() {
  const { isPro, current, lastEnded, billing, loading } = usePlan();
  const [dismissed, setDismissed] = useState(readDismissed);

  if (loading) return null;

  let tone: 'renew' | 'soon' | 'nudge' | null = null;
  let text = '';
  if (!isPro && lastEnded?.expires_at) {
    tone = 'renew';
    text = `Your Pro plan ended on ${formatDay(lastEnded.expires_at.slice(0, 10))}. Renew to unlock unlimited AI and the matcher again.`;
  } else if (isPro && billing?.status !== 'active' && current?.expires_at && new Date(current.expires_at).getTime() - Date.now() < 3 * DAY) {
    tone = 'soon';
    text = `Pro ends ${formatDay(current.expires_at.slice(0, 10))}. Add another month to keep it.`;
  } else if (!isPro && !dismissed) {
    tone = 'nudge';
    text = 'Pro: unlimited AI, scholarship matcher and essay reviews — GH₵ 10 a month.';
  }

  return (
    <AnimatePresence>
      {tone && (
        <motion.aside
          className="renewal"
          data-tone={tone}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, height: 0, marginBlock: 0 }}
          transition={{ duration: 0.3 }}
          aria-label="Plan status"
        >
          <Sparkles className="renewal__icon" aria-hidden="true" />
          <p className="renewal__text">{text}</p>
          <Link to="/paywall" className="renewal__cta">
            {tone === 'nudge' ? 'See Pro' : 'Renew'}
          </Link>
          {tone === 'nudge' && (
            <button
              type="button"
              className="renewal__close"
              aria-label="Dismiss"
              onClick={() => {
                setDismissed(true);
                try {
                  window.localStorage.setItem(DISMISS_KEY, '1');
                } catch {
                  /* storage unavailable: dismiss for this visit only */
                }
              }}
            >
              <X aria-hidden="true" />
            </button>
          )}
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
