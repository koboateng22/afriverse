import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { BadgeCheck, Clock, Crown, Gift, MessageCircleHeart, Receipt, Sparkles } from 'lucide-react';
import { PageTransition } from '../../components/PageTransition/PageTransition';
import { PageHeader } from '../../components/PageHeader/PageHeader';
import { Button } from '../../components/Button/Button';
import { Notice } from '../../components/Notice/Notice';
import { Skeleton } from '../../components/Skeleton/Skeleton';
import { useAuth } from '../../features/auth/useAuth';
import { usePlan } from '../../features/billing/PlanProvider';
import { usePaywall } from '../../features/billing/PaywallModal';
import { startCheckout } from '../../features/billing/paystack';
import {
  claimFreeReview,
  fetchCounselorStatus,
  fetchMyPurchases,
  fetchOneTimeProducts,
  PRODUCT_FALLBACK,
  whatsappLink,
  type CounselorStatus,
  type Purchase,
} from '../../features/billing/api';
import { formatMoney } from '../../lib/money';
import { errorMessage } from '../../lib/supabase';
import { riseItem, staggerParent } from '../../lib/motion';
import './Counsellor.css';

export const FREE_REVIEW_MESSAGE = 'Hi Afriversity, I want to claim my free human review for my essay.';
const NOT_SET_UP = 'Counsellor chat is being set up. Please try again later.';

/**
 * Opens WhatsApp. The tab is opened before any network call (popup blockers allow it only
 * straight from the tap) and pointed at wa.me once the number is known.
 */
async function openWhatsapp(getLink: () => Promise<string>) {
  const tab = window.open('', '_blank');
  try {
    const link = await getLink();
    if (tab) {
      tab.opener = null;
      tab.location.href = link;
    } else {
      window.location.href = link;
    }
  } catch (e) {
    tab?.close();
    throw e;
  }
}

/** /counsellor — real people on WhatsApp: unlimited with Pro; one free review, then GH₵ 15 each. */
export default function Counsellor() {
  const { profile } = useAuth();
  const { isPro } = usePlan();
  const { openPaywall } = usePaywall();
  const [status, setStatus] = useState<CounselorStatus | null>(null);
  const [reviews, setReviews] = useState<Purchase[]>([]);
  const [price, setPrice] = useState(PRODUCT_FALLBACK.essay_review.amount_cents);
  const [busy, setBusy] = useState<'claim' | 'message' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [s, mine] = await Promise.all([fetchCounselorStatus(), fetchMyPurchases().catch(() => [] as Purchase[])]);
      setStatus(s);
      setReviews(mine.filter((p) => p.product === 'essay_review'));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    void load();
    void fetchOneTimeProducts().then((p) => setPrice(p.essay_review.amount_cents)).catch(() => undefined);
  }, [load, isPro]);

  const pro = isPro || status?.pro === true;
  const claimed = Boolean(status?.free_review_claimed_at);
  const firstName = profile?.full_name?.trim().split(/\s+/)[0];

  const claim = async () => {
    if (!status?.whatsapp) return setError(NOT_SET_UP); // never use up the free review without a number to send it to
    setBusy('claim');
    setError(null);
    try {
      await openWhatsapp(async () => {
        const { whatsapp } = await claimFreeReview();
        const number = whatsapp || status.whatsapp;
        if (!number) throw new Error(NOT_SET_UP);
        return whatsappLink(number, FREE_REVIEW_MESSAGE);
      });
      setStatus((s) => (s ? { ...s, free_review_claimed_at: new Date().toISOString() } : s));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const message = async (text: string) => {
    if (!status?.whatsapp) return setError(NOT_SET_UP);
    setBusy('message');
    setError(null);
    try {
      await openWhatsapp(async () => whatsappLink(status.whatsapp as string, text));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const buyReview = () =>
    openPaywall('Human counsellors read your essay line by line and send back what to fix.', {
      offer: {
        title: `VIP Essay Review for ${formatMoney(price, 'GHS')}`,
        detail: 'One-time payment. A real Afriversity counsellor reviews one essay on WhatsApp.',
        priceCents: price,
        cta: `Pay ${formatMoney(price, 'GHS')} for a review`,
        buy: () => startCheckout({ type: 'purchase', product: 'essay_review' }, { expectedCents: price }),
      },
    });

  return (
    <PageTransition label="WhatsApp Counsellor">
      <div className="container counsellor">
        <PageHeader
          back={{ to: '/profile', label: 'You' }}
          eyebrow="Human support"
          title="WhatsApp Counsellor"
          lede="A real person reads your essay, CV or application and tells you exactly what to improve."
        />
        {error && <Notice tone="error">{error}</Notice>}

        {!status && !error && <Skeleton shape="block" height="240px" label="Loading" />}

        {status && (
          <motion.div className="counsellor__stack" variants={staggerParent} initial="hidden" animate="show">
            {pro ? (
              <motion.section className="counsel-card" data-tone="pro" variants={riseItem} aria-labelledby="c-pro">
                <span className="counsel-card__icon" aria-hidden="true">
                  <Crown />
                </span>
                <h2 id="c-pro" className="counsel-card__title">Unlimited human reviews</h2>
                <p className="counsel-card__text">You’re on Pro: message your counsellor as often as you need, for essays, CVs and applications.</p>
                <Button
                  size="lg"
                  block
                  variant="gold"
                  icon={<MessageCircleHeart aria-hidden="true" />}
                  loading={busy === 'message'}
                  onClick={() => void message(`Hi Afriversity, I'm ${profile?.full_name ?? 'a Pro student'} and I'd like to speak to a counsellor.`)}
                >
                  Message your counsellor
                </Button>
              </motion.section>
            ) : !claimed ? (
              <motion.section className="counsel-card" data-tone="gift" variants={riseItem} aria-labelledby="c-free">
                <span className="counsel-card__icon" aria-hidden="true">
                  <Gift />
                </span>
                <p className="counsel-card__eyebrow">On us{firstName ? `, ${firstName}` : ''}</p>
                <h2 id="c-free" className="counsel-card__title">Your first human review is free</h2>
                <p className="counsel-card__text">Send one essay to a real Afriversity counsellor on WhatsApp. No payment, no card.</p>
                <Button size="lg" block icon={<MessageCircleHeart aria-hidden="true" />} loading={busy === 'claim'} onClick={() => void claim()}>
                  Claim your 1 Free Human Essay Review
                </Button>
                <p className="counsel-card__fine">Opens WhatsApp with your message ready to send. One free review per student.</p>
              </motion.section>
            ) : (
              <motion.section className="counsel-card" data-tone="used" variants={riseItem} aria-labelledby="c-used">
                <span className="counsel-card__icon" aria-hidden="true">
                  <BadgeCheck />
                </span>
                <h2 id="c-used" className="counsel-card__title">Free review used</h2>
                <Button size="lg" block variant="gold" icon={<Crown aria-hidden="true" />} onClick={() => openPaywall('Pro includes unlimited human reviews on WhatsApp.')}>
                  You’ve used your free review. Upgrade to Pro for unlimited access.
                </Button>
              </motion.section>
            )}

            {!pro && (
              <motion.section className="counsel-card" data-tone="vip" variants={riseItem} aria-labelledby="c-vip">
                <span className="counsel-card__icon" aria-hidden="true">
                  <Sparkles />
                </span>
                <h2 id="c-vip" className="counsel-card__title">VIP Essay Review · {formatMoney(price, 'GHS')}</h2>
                <p className="counsel-card__text">Pay once for one review by a human counsellor. Or go Pro for unlimited reviews.</p>
                <Button size="lg" block variant="secondary" onClick={buyReview}>
                  Get a VIP Essay Review
                </Button>
              </motion.section>
            )}

            {!pro && reviews.length > 0 && (
              <motion.section className="counsel-card" data-tone="paid" variants={riseItem} aria-labelledby="c-paid">
                <span className="counsel-card__icon" aria-hidden="true">
                  <Receipt />
                </span>
                <h2 id="c-paid" className="counsel-card__title">
                  {reviews.length === 1 ? 'Your VIP review is paid' : `${reviews.length} VIP reviews paid`}
                </h2>
                <p className="counsel-card__text">Send your essay on WhatsApp and mention your reference so the counsellor can find your payment.</p>
                <ul className="counsel-card__refs" role="list">
                  {reviews.map((r) => (
                    <li key={r.id}>
                      <code>{r.payment_ref}</code>
                    </li>
                  ))}
                </ul>
                <Button
                  size="lg"
                  block
                  icon={<MessageCircleHeart aria-hidden="true" />}
                  loading={busy === 'message'}
                  onClick={() => void message(`Hi Afriversity, I paid for a VIP Essay Review. My reference is ${reviews[0].payment_ref}.`)}
                >
                  Send my essay on WhatsApp
                </Button>
              </motion.section>
            )}

            {status.hours && (
              <motion.p className="counsellor__hours" variants={riseItem}>
                <Clock aria-hidden="true" /> Counsellors reply {status.hours}.
              </motion.p>
            )}
          </motion.div>
        )}
      </div>
    </PageTransition>
  );
}
