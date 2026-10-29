import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, CreditCard, Smartphone } from 'lucide-react';
import { Button } from '../../components/Button/Button';
import { Magnetic } from '../../components/Magnetic/Magnetic';
import { Notice } from '../../components/Notice/Notice';
import { ProOfferSkeleton } from '../../components/Skeleton/Skeleton';
import { formatMoney } from '../../lib/money';
import { errorMessage } from '../../lib/supabase';
import { riseItem, spring, staggerParent } from '../../lib/motion';
import { fetchProPlan } from './api';
import { startCheckout } from './paystack';
import type { PlanRow } from './types';
import './ProOffer.css';

type Method = 'card' | 'momo';

const METHODS: Array<{ id: Method; title: string; detail: string; icon: typeof CreditCard }> = [
  { id: 'card', title: 'Card', detail: 'Renews every month. Cancel any time.', icon: CreditCard },
  { id: 'momo', title: 'Mobile Money', detail: 'MTN, Telecel, AirtelTigo. One month, renew when you like.', icon: Smartphone },
];

/** Pro plan + payment method + one gold CTA. Used by /paywall and the paywall modal. */
export function ProOffer({ compact }: { compact?: boolean }) {
  const [plan, setPlan] = useState<PlanRow | null>(null);
  const [method, setMethod] = useState<Method>('card');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchProPlan()
      .then(setPlan)
      .catch((e) => setError(errorMessage(e)));
  }, []);

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

  if (!plan) return error ? <Notice tone="error">{error}</Notice> : <ProOfferSkeleton />;

  return (
    <motion.div className="pro-offer" data-compact={compact || undefined} variants={staggerParent} initial="hidden" animate="show">
      {/* The tier card floats on a slowly breathing halo (decorative, behind the card). */}
      <motion.section className="pro-offer__tier" variants={riseItem} aria-label="Afriversity Pro">
        <span className="pro-offer__halo" aria-hidden="true" />
        <div className="pro-card">
          <div className="pro-offer__head">
            <span className="pro-offer__badge">Pro</span>
            <p className="pro-offer__price">
              {formatMoney(plan.amount_cents, plan.currency)}
              <small> / month</small>
            </p>
          </div>
          <ul className="pro-offer__features" role="list">
            {plan.features.map((f) => (
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
              {on && <motion.span className="pay-method__ring" layoutId="pay-method-ring" transition={spring} aria-hidden="true" />}
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
          {method === 'card' ? 'Start Pro' : 'Get 1 month of Pro'} · {formatMoney(plan.amount_cents, plan.currency)}
        </Button>
      </Magnetic>
      <p className="pro-offer__fine">Secured by Paystack. Prices in Ghana cedis.</p>
    </motion.div>
  );
}
