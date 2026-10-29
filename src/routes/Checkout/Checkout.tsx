import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { BadgeCheck, CircleX, Hourglass } from 'lucide-react';
import { PageTransition } from '../../components/PageTransition/PageTransition';
import { ButtonLink, Button } from '../../components/Button/Button';
import { Confetti } from '../../components/Confetti/Confetti';
import { FullscreenLoader } from '../../components/FullscreenLoader/FullscreenLoader';
import { verifyPayment, type VerifyResponse } from '../../features/billing/paystack';
import { usePlan } from '../../features/billing/PlanProvider';
import { formatMoney } from '../../lib/money';
import { errorMessage } from '../../lib/supabase';
import './Checkout.css';

const POLL_MS = 3000;
const MAX_POLLS = 40; // ~2 minutes — MoMo approvals can take a while

const NEXT: Record<VerifyResponse['kind'], { to: string; label: string; title: string; body: string }> = {
  subscription: { to: '/home', label: 'Back to your feed', title: 'Welcome to Pro', body: 'Unlimited AI, the Scholarship Matcher, essay reviews, the full tracker and a human counsellor are unlocked.' },
  application: { to: '/applications', label: 'Complete your application', title: 'Payment received', body: 'Next, fill in the details the university needs.' },
  mentor: { to: '/mentors', label: 'Back to mentors', title: 'Session booked', body: 'Your session is confirmed. You will find it at the top of the Mentors page.' },
};

/** Paystack returns here (?ref= / ?reference=). We poll paystack-verify until the charge settles. */
export default function Checkout() {
  const [params] = useSearchParams();
  const reference = params.get('ref') ?? params.get('reference') ?? params.get('trxref');
  const { refresh } = usePlan();
  const [result, setResult] = useState<VerifyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const polls = useRef(0);

  const check = useCallback(async () => {
    if (!reference) return;
    try {
      const r = await verifyPayment(reference);
      setResult(r);
      setError(null);
      if (r.status === 'success' && r.kind === 'subscription') void refresh();
      return r.status;
    } catch (e) {
      setError(errorMessage(e));
      return 'error';
    }
  }, [reference, refresh]);

  useEffect(() => {
    if (!reference) return;
    let timer: number | undefined;
    let cancelled = false;
    const loop = async () => {
      const status = await check();
      polls.current += 1;
      if (cancelled) return;
      if (status === 'pending' || status === 'error') {
        if (polls.current >= MAX_POLLS) setTimedOut(true);
        else timer = window.setTimeout(loop, POLL_MS);
      }
    };
    void loop();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [reference, check]);

  if (!reference) {
    return (
      <PageTransition bare label="Checkout">
        <div className="container checkout">
          <CircleX className="checkout__icon" data-tone="fail" aria-hidden="true" />
          <h1>No payment to check</h1>
          <p>This page opens after Paystack checkout. Start from plans, a mentor or a university application.</p>
          <ButtonLink to="/home">Go to your feed</ButtonLink>
        </div>
      </PageTransition>
    );
  }

  // Application fee paid → straight to the university's form.
  if (result?.status === 'success' && result.kind === 'application' && result.related_id) {
    return <Navigate to={`/applications/${result.related_id}/complete?paid=1`} replace />;
  }

  if (result?.status === 'success') {
    const next = NEXT[result.kind];
    return (
      <PageTransition bare label="Payment successful">
        <div className="container checkout" role="status">
          <Confetti />
          {/* Badge overshoots then settles (spring with low damping). */}
          <motion.span
            className="checkout__badge"
            initial={{ scale: 0, rotate: -30 }}
            animate={{ scale: [0, 1.25, 1], rotate: 0 }}
            transition={{ duration: 0.7, times: [0, 0.6, 1], ease: [0.34, 1.56, 0.64, 1] }}
          >
            <BadgeCheck aria-hidden="true" />
          </motion.span>
          <motion.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
            {next.title}
          </motion.h1>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }}>
            {next.body} Paid {formatMoney(result.amount_cents, result.currency)} · ref {reference.slice(-10)}
          </motion.p>
          <ButtonLink to={next.to} size="lg">
            {next.label}
          </ButtonLink>
        </div>
      </PageTransition>
    );
  }

  if (result?.status === 'failed') {
    return (
      <PageTransition bare label="Payment failed">
        <div className="container checkout" role="alert">
          <CircleX className="checkout__icon" data-tone="fail" aria-hidden="true" />
          <h1>Payment didn't go through</h1>
          <p>{result.failure_reason?.includes('refund_required') ? 'That slot was taken by someone else while you paid. The Afriversity team will refund you in full.' : `Paystack said: ${result.failure_reason ?? 'the charge was declined'}. You weren't charged.`}</p>
          <ButtonLink to={result.kind === 'subscription' ? '/paywall' : result.kind === 'application' ? '/apply-university' : '/mentors'}>Try again</ButtonLink>
        </div>
      </PageTransition>
    );
  }

  if (timedOut) {
    return (
      <PageTransition bare label="Payment pending">
        <div className="container checkout">
          <Hourglass className="checkout__icon" aria-hidden="true" />
          <h1>Still waiting for confirmation</h1>
          <p>If you approved a Mobile Money prompt, it can take a few minutes to reach us. Your payment is safe — you can check again or come back later.</p>
          {error && <p className="checkout__error">{error}</p>}
          <Button
            onClick={() => {
              polls.current = 0;
              setTimedOut(false);
              void check();
            }}
          >
            Check again
          </Button>
          <Link to="/home" className="checkout__later">
            I'll check later
          </Link>
        </div>
      </PageTransition>
    );
  }

  return <FullscreenLoader label="Confirming your payment with Paystack…" />;
}
