import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { LockOpen, ShieldCheck, Sparkles, Users } from 'lucide-react';
import { Sheet } from '../../components/Sheet/Sheet';
import { Button } from '../../components/Button/Button';
import { Notice } from '../../components/Notice/Notice';
import { formatMoney } from '../../lib/money';
import { errorMessage } from '../../lib/supabase';
import { riseItem, staggerParent } from '../../lib/motion';
import { communityLabel, fetchCommunitySize, fetchOneTimeProducts, fetchProPlan, PRODUCT_FALLBACK } from './api';
import { ProOffer } from './ProOffer';
import './PaywallModal.css';

/** A one-time alternative to Pro, shown above it (e.g. "Unlock this CV for GH₵ 10"). */
export type OneTimeOffer = {
  title: string;
  detail: string;
  priceCents: number;
  cta: string;
  /** Starts the checkout (redirects to Paystack). Errors are shown in the modal. */
  buy: () => Promise<void>;
};

type PaywallOptions = { offer?: OneTimeOffer };

type PaywallState = {
  /** Opens the upgrade sheet. `reason` explains what the student just ran into. */
  openPaywall: (reason?: string, options?: PaywallOptions) => void;
};

const PaywallContext = createContext<PaywallState | null>(null);

/** "Join 200+ students already using Afriversity. Upgrade today." — from the real student count. */
export function SocialProof() {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void fetchCommunitySize().then((n) => active && setLabel(communityLabel(n)));
    return () => {
      active = false;
    };
  }, []);
  return (
    <p className="social-proof">
      <Users aria-hidden="true" />
      <span>
        {label ? <>Join <strong>{label} students</strong> already using Afriversity.</> : <>Join the students already using Afriversity.</>} Upgrade today.
      </span>
    </p>
  );
}

/** "Stop paying GH₵ 15 per review…": Pro's value against pay-as-you-go, from live prices. */
export function ValueStack() {
  const [review, setReview] = useState(PRODUCT_FALLBACK.essay_review.amount_cents);
  const [pro, setPro] = useState(3500);
  useEffect(() => {
    let active = true;
    void fetchOneTimeProducts().then((p) => active && setReview(p.essay_review.amount_cents)).catch(() => undefined);
    void fetchProPlan().then((p) => active && p && setPro(p.amount_cents)).catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  return (
    <p className="value-stack">
      Stop paying {formatMoney(review, 'GHS')} per review. Get <strong>UNLIMITED</strong> Human Counselors, CV Builder, and Priority Concierge for only{' '}
      <strong className="value-stack__price">{formatMoney(pro, 'GHS')}/month</strong>.
    </p>
  );
}

function OfferCard({ offer }: { offer: OneTimeOffer }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const buy = async () => {
    setBusy(true);
    setError(null);
    try {
      await offer.buy(); // redirects to Paystack
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };
  return (
    <motion.section className="once-offer" variants={riseItem} aria-label={offer.title}>
      <div className="once-offer__head">
        <span className="once-offer__icon" aria-hidden="true">
          <LockOpen />
        </span>
        <div>
          <h3 className="once-offer__title">{offer.title}</h3>
          <p className="once-offer__detail">{offer.detail}</p>
        </div>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      <Button size="lg" block loading={busy} onClick={buy}>
        {offer.cta}
      </Button>
      <p className="once-offer__fine">
        <ShieldCheck aria-hidden="true" /> One-time payment · Mobile Money or card · Secured by Paystack
      </p>
    </motion.section>
  );
}

export function PaywallProvider({ children }: { children: ReactNode }) {
  const [reason, setReason] = useState<string | null>(null);
  const [offer, setOffer] = useState<OneTimeOffer | null>(null);
  const [open, setOpen] = useState(false);

  const openPaywall = useCallback((r?: string, options?: PaywallOptions) => {
    setReason(r ?? null);
    setOffer(options?.offer ?? null);
    setOpen(true);
  }, []);
  const value = useMemo(() => ({ openPaywall }), [openPaywall]);

  return (
    <PaywallContext.Provider value={value}>
      {children}
      <Sheet open={open} onClose={() => setOpen(false)} title={offer ? 'Unlock or go Pro' : 'Upgrade to Pro'} size="full">
        <motion.div className="paywall-modal" variants={staggerParent} initial="hidden" animate="show">
          <SocialProof />
          {reason && (
            <p className="paywall-modal__reason">
              <Sparkles aria-hidden="true" />
              {reason}
            </p>
          )}
          {offer && <OfferCard offer={offer} />}
          {offer && (
            <p className="paywall-modal__or" aria-hidden="true">
              <span>or get everything</span>
            </p>
          )}
          <ValueStack />
          <ProOffer compact />
        </motion.div>
      </Sheet>
    </PaywallContext.Provider>
  );
}

export function usePaywall(): PaywallState {
  const ctx = useContext(PaywallContext);
  if (!ctx) throw new Error('usePaywall must be used inside <PaywallProvider>');
  return ctx;
}
