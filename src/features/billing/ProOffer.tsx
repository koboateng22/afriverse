import { useEffect, useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { Check, CreditCard, FileText, Headset, MessageCircle, Smartphone, Tag } from 'lucide-react';
import { Button } from '../../components/Button/Button';
import { Field } from '../../components/Field/Field';
import { Magnetic } from '../../components/Magnetic/Magnetic';
import { Notice } from '../../components/Notice/Notice';
import { formatMoney } from '../../lib/money';
import { errorMessage } from '../../lib/supabase';
import { riseItem, staggerParent } from '../../lib/motion';
import { FunctionError } from '../../lib/functions';
import { checkPromoCode, discountedCents, fetchProPlan } from './api';
import { startCheckout } from './paystack';
import type { PlanRow } from './types';
import './ProOffer.css';

type Method = 'card' | 'momo';

const METHODS: Array<{ id: Method; title: string; detail: string; icon: typeof CreditCard }> = [
  { id: 'card', title: 'Card', detail: 'Renews every month. Cancel any time.', icon: CreditCard },
  { id: 'momo', title: 'Mobile Money', detail: 'MTN, Telecel, AirtelTigo. One month, renew when you like.', icon: Smartphone },
];

// Shown until the plan row arrives, or if it can't be read. Mirrors migration 0022
// and paystack-init's DEFAULT_PRO, which charges this price when the row is missing.
const FALLBACK_PRICE = { amount_cents: 3500, currency: 'GHS' };
const INVALID_CODE = 'Invalid or expired code.';

type Promo = { code: string; percentage: number };
type PromoMsg = { tone: 'success' | 'error'; text: string };
const DEFAULT_FEATURES = [
  'Direct WhatsApp access to a Human Counselor',
  'CV & Essay Strategy Sessions',
  'Priority Support',
  'Scholarship Matcher — ranked by how well you fit',
  'Application Tracker with full timeline',
  'Insider application guides',
];
// Pro is human support: the first three features lead, larger and with their own icon.
const HIGHLIGHTED = 3;
const iconFor = (feature: string) =>
  /whatsapp|counsel/i.test(feature) ? MessageCircle : /\bcv\b|essay/i.test(feature) ? FileText : /support/i.test(feature) ? Headset : Check;

/**
 * Pro plan (human support) + payment method + one gold CTA. Used by /paywall and
 * the paywall modal. Never waits on the plan fetch: the button is always live, and
 * until (or unless) the plan row is read the screen shows the GH₵ 35 fallback.
 * A promo code lowers the shown price; paystack-init re-checks the code and prices
 * the charge from the database either way.
 */
export function ProOffer({ compact }: { compact?: boolean }) {
  const [plan, setPlan] = useState<PlanRow | null>(null);
  const [method, setMethod] = useState<Method>('card');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState('');
  const [promo, setPromo] = useState<Promo | null>(null);
  const [promoMsg, setPromoMsg] = useState<PromoMsg | null>(null);
  const [checking, setChecking] = useState(false);

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
  const listPrice = formatMoney(shown.amount_cents, shown.currency);
  const payCents = promo ? discountedCents(shown.amount_cents, promo.percentage) : shown.amount_cents;
  const price = formatMoney(payCents, shown.currency);

  const applyCode = async (e: FormEvent) => {
    e.preventDefault();
    const code = codeInput.trim().toUpperCase();
    if (!code) return;
    setChecking(true);
    setPromoMsg(null);
    try {
      const percentage = await checkPromoCode(code);
      if (percentage) {
        setPromo({ code, percentage });
        setCodeInput(code);
        setPromoMsg({ tone: 'success', text: `Code applied! ${percentage}% off.` });
      } else {
        setPromo(null);
        setPromoMsg({ tone: 'error', text: INVALID_CODE });
      }
    } catch {
      setPromoMsg({ tone: 'error', text: 'We couldn’t check that code. Check your connection and try again.' });
    } finally {
      setChecking(false);
    }
  };

  const removeCode = () => {
    setPromo(null);
    setCodeInput('');
    setPromoMsg(null);
  };
  const features = plan && Array.isArray(plan.features) && plan.features.length > 0 ? plan.features : DEFAULT_FEATURES;

  const pay = async () => {
    setBusy(true);
    setError(null);
    try {
      // The code goes to the server, which re-checks it and prices the charge.
      await startCheckout({ type: 'subscription', method, ...(promo ? { promo_code: promo.code } : {}) }); // redirects to Paystack
    } catch (e) {
      if (e instanceof FunctionError && e.code === 'invalid_promo') {
        // Switched off since it was applied: back to the full price, nothing charged.
        setPromo(null);
        setPromoMsg({ tone: 'error', text: INVALID_CODE });
        setError(`That code no longer works, so nothing was charged. Pro is ${listPrice} a month without it.`);
      } else {
        setError(errorMessage(e));
      }
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
              {promo && (
                <>
                  <span className="visually-hidden">Was </span>
                  <del className="pro-offer__was">{listPrice}</del>
                  <span className="visually-hidden">, now </span>
                </>
              )}
              {price}
              <small> / month</small>
            </p>
          </div>

          <form className="promo" onSubmit={applyCode} noValidate>
            <div className="promo__row">
              <Field
                label="Have a promo code?"
                icon={<Tag />}
                placeholder="e.g. WAITLIST20"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                maxLength={32}
                value={codeInput}
                onChange={(e) => {
                  const next = e.target.value.toUpperCase();
                  setCodeInput(next);
                  // Editing an applied code un-applies it, so the price shown is always what's charged.
                  if (promo && next.trim() !== promo.code) {
                    setPromo(null);
                    setPromoMsg(null);
                  }
                }}
              />
              {promo ? (
                <Button variant="secondary" onClick={removeCode}>
                  Remove
                </Button>
              ) : (
                <Button type="submit" variant="secondary" loading={checking} disabled={!codeInput.trim()}>
                  Apply
                </Button>
              )}
            </div>
            {promoMsg && (
              <p className="promo__msg" data-tone={promoMsg.tone} role={promoMsg.tone === 'error' ? 'alert' : 'status'}>
                {promoMsg.text}
              </p>
            )}
            {promo && (
              <p className="promo__note">
                {method === 'card'
                  ? `Your card renews at ${price} every month.`
                  : `This month costs ${price}. Use the code again when you renew.`}
              </p>
            )}
          </form>
          <ul className="pro-offer__highlights" role="list" aria-label="Human support">
            {features.slice(0, HIGHLIGHTED).map((f) => {
              const Icon = iconFor(f);
              return (
                <li key={f}>
                  <Icon aria-hidden="true" />
                  {f}
                </li>
              );
            })}
          </ul>
          {features.length > HIGHLIGHTED && (
            <ul className="pro-offer__features" role="list" aria-label="Also included">
              {features.slice(HIGHLIGHTED).map((f) => (
                <li key={f}>
                  <Check aria-hidden="true" />
                  {f}
                </li>
              ))}
            </ul>
          )}
          <p className="pro-offer__free-ai">Career Compass and the AI Essay Reviewer stay free for everyone.</p>
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
