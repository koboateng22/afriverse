import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, CreditCard, Smartphone } from 'lucide-react';
import { Button } from '../../components/Button/Button';
import { Magnetic } from '../../components/Magnetic/Magnetic';
import { Notice } from '../../components/Notice/Notice';
import { formatMoney } from '../../lib/money';
import { errorMessage } from '../../lib/supabase';
import { riseItem, staggerParent } from '../../lib/motion';
import { fetchProPlan } from './api';
import { startCheckout } from './paystack';
import type { PlanRow } from './types';
import './ProOffer.css';

type Method = 'card' | 'momo';

const METHODS: Array<{ id: Method; title: string; detail: string; icon: typeof CreditCard }> = [
  { id: 'card', title: 'Card', detail: 'Renews every month. Cancel any time.', icon: CreditCard },
  { id: 'momo', title: 'Mobile Money', detail: 'MTN, Telecel, AirtelTigo. One month, renew when you like.', icon: Smartphone },
];

// Shown until the plan row arrives, or if it can't be read. Mirrors migration 0013
// and paystack-init's DEFAULT_PRO, which charges this price when the row is missing.
const FALLBACK_PRICE = { amount_cents: 1000, currency: 'GHS' };
const DEFAULT_FEATURES = [
  'Unlimited AI counsellor messages',
  'Scholarship Matcher — ranked by how well you fit',
  'AI Essay Reviewer',
  'Application Tracker with full timeline',
  'Human counsellor on WhatsApp',
];

/**
 * Pro plan + payment method + one gold CTA. Used by /paywall and the paywall modal.
 * Never waits on the plan fetch: the button is always live, and until (or unless)
 * the plan row is read the screen shows the GH₵ 10 fallback. paystack-init still
 * prices the charge from the database.
 */
export function ProOffer({ compact }: { compact?: boolean }) {
  const [plan, setPlan] = useState<PlanRow | null>(null);
  const [method, setMethod] = useState<Method>('card');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchProPlan()
      .then((row) => {
        if (active) setPlan(row);
      })
      .catch(() => undefined); // keep the fallback price
    return () => {
      active = false;
    };
  }, []);

  const shown = plan ?? FALLBACK_PRICE;
  const price = formatMoney(shown.amount_cents, shown.currency);
  const features = plan && Array.isArray(plan.features) && plan.features.length > 0 ? plan.features : DEFAULT_FEATURES;

  const pay = async () => {
    setBusy(true);
    setError(null);
    try {
      await startCheckout({ type: 'subscription', method }); // redirects to Paystack
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <motion.div className="pro-offer" data-compact={compact || undefined} variants={staggerParent} initial="hidden" animate="show">
      {/* The tier card floats on a slowly breathing halo (decorative, behind the card). */}
      <motion.section className="pro-offer__tier" variants={riseItem} aria-label="Afriversity Pro">
        <span className="pro-offer__halo" aria-hidden="true" />
        <div className="pro-card">
          <div className="pro-offer__head">
            <span className="pro-offer__badge">Pro</span>
            <p className="pro-offer__price">
              {price}
              <small> / month</small>
            </p>
          </div>
          <ul className="pro-offer__features" role="list">
            {features.map((f) => (
              <li key={f}>
                <Check aria-hidden="true" />
                {f}
              </li>
            ))}
          </ul>
        </div>
      </motion.section>

      <motion.div className="pro-offer__methods" role="radiogroup" aria-label="How do you want to pay?" variants={riseItem}>
        {METHODS.map(({ id, title, detail, icon: Icon }) => {
          const on = method === id;
          return (
            <button key={id} type="button" role="radio" aria-checked={on} className="pay-method" data-selected={on || undefined} onClick={() => setMethod(id)}>
              {on && <span className="pay-method__ring" aria-hidden="true" />}
              <Icon className="pay-method__icon" aria-hidden="true" />
              <span className="pay-method__text">
                <span className="pay-method__title">{title}</span>
                <span className="pay-method__detail">{detail}</span>
              </span>
            </button>
          );
        })}
      </motion.div>

      {error && <Notice tone="error">{error}</Notice>}

      <Magnetic className="pro-offer__cta">
        <Button variant="gold" size="lg" block loading={busy} onClick={pay}>
          {method === 'card' ? 'Start Pro' : 'Get 1 month of Pro'}
          {` · ${price}`}
        </Button>
      </Magnetic>
      <p className="pro-offer__fine">Secured by Paystack. Prices in Ghana cedis.</p>
    </motion.div>
  );
}
