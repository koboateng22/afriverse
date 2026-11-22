import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { BadgeCheck, Building2, ChevronRight, FileText, MessageCircleHeart } from 'lucide-react';
import { PageTransition } from '../../components/PageTransition/PageTransition';
import { PageHeader } from '../../components/PageHeader/PageHeader';
import { Button } from '../../components/Button/Button';
import { Notice } from '../../components/Notice/Notice';
import { ProOffer } from '../../features/billing/ProOffer';
import { SocialProof, ValueStack } from '../../features/billing/PaywallModal';
import { formatMoney } from '../../lib/money';
import { usePlan } from '../../features/billing/PlanProvider';
import { cancelAutoRenew, cardManageLink, fetchOneTimeProducts, PRODUCT_FALLBACK } from '../../features/billing/api';
import { formatDay } from '../../lib/dates';
import { errorMessage } from '../../lib/supabase';
import { riseItem } from '../../lib/motion';
import './Paywall.css';

export default function Paywall() {
  const { isPro, current, billing, refresh } = usePlan();
  const [busy, setBusy] = useState<'cancel' | 'card' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const autoRenew = billing?.status === 'active';
  const [prices, setPrices] = useState(PRODUCT_FALLBACK);
  useEffect(() => {
    void fetchOneTimeProducts().then(setPrices).catch(() => undefined);
  }, []);
  const until = current?.expires_at ? formatDay(current.expires_at.slice(0, 10)) : null;

  const cancel = async () => {
    if (!window.confirm('Stop renewing Pro? You keep Pro until the end of the month you paid for.')) return;
    setBusy('cancel');
    setError(null);
    try {
      await cancelAutoRenew();
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const updateCard = async () => {
    setBusy('card');
    setError(null);
    try {
      const { link } = await cardManageLink();
      window.location.href = link;
    } catch (e) {
      setError(errorMessage(e));
      setBusy(null);
    }
  };

  return (
    <PageTransition label="Afriversity Pro">
      <div className="container paywall">
        <PageHeader
          back={{ to: '/profile', label: 'You' }}
          artTone="gold"
          eyebrow="Afriversity Pro"
          title={isPro ? 'You’re on Pro' : 'A real counsellor in your corner'}
          lede={isPro ? undefined : 'The AI tools are free for everyone. Pro adds people and power tools: the AI CV Builder for Scholarships & Jobs, a counsellor on WhatsApp, and priority support.'}
        />
        {!isPro && <SocialProof />}
        {!isPro && <ValueStack />}

        {isPro && (
          <motion.section className="paywall__status" variants={riseItem} initial="hidden" animate="show" aria-label="Your plan">
            <BadgeCheck className="paywall__status-icon" aria-hidden="true" />
            <div className="paywall__status-text">
              <p className="paywall__status-title">Pro is active{until ? ` until ${until}` : ''}</p>
              <p>
                {autoRenew
                  ? `Your card renews it automatically${billing?.next_payment_date ? ` on ${formatDay(billing.next_payment_date.slice(0, 10))}` : ' each month'}.`
                  : billing?.status === 'non-renewing'
                    ? 'Auto-renew is off. Pay again with card or Mobile Money any time.'
                    : 'Paid with Mobile Money. Add another month whenever you like — it stacks on the time you have left.'}
              </p>
            </div>
          </motion.section>
        )}

        {error && <Notice tone="error">{error}</Notice>}

        {autoRenew ? (
          <div className="paywall__manage">
            <Button variant="secondary" block loading={busy === 'card'} onClick={updateCard}>
              Update card
            </Button>
            <Button variant="quiet" block loading={busy === 'cancel'} onClick={cancel}>
              Cancel auto-renew
            </Button>
          </div>
        ) : (
          <ProOffer />
        )}

        {!isPro && (
          <motion.section className="payg" variants={riseItem} initial="hidden" animate="show" aria-labelledby="payg-h">
            <h2 id="payg-h" className="payg__title">Not ready for monthly? Pay as you go</h2>
            <p className="payg__lede">One-time payments by Mobile Money or card. No subscription.</p>
            <ul className="payg__list" role="list">
              <li>
                <Link to="/cv-builder" className="payg__item">
                  <FileText aria-hidden="true" className="payg__icon" />
                  <span className="payg__text">
                    <span className="payg__name">Download your AI-written CV</span>
                    <span className="payg__detail">Generate free, then unlock the PDF once</span>
                  </span>
                  <span className="payg__price">{formatMoney(prices.cv_download.amount_cents, 'GHS')}</span>
                  <ChevronRight aria-hidden="true" className="payg__go" />
                </Link>
              </li>
              <li>
                <Link to="/counsellor" className="payg__item">
                  <MessageCircleHeart aria-hidden="true" className="payg__icon" />
                  <span className="payg__text">
                    <span className="payg__name">VIP Essay Review by a human</span>
                    <span className="payg__detail">Your first review is free</span>
                  </span>
                  <span className="payg__price">{formatMoney(prices.essay_review.amount_cents, 'GHS')}</span>
                  <ChevronRight aria-hidden="true" className="payg__go" />
                </Link>
              </li>
              <li>
                <Link to="/apply-university" className="payg__item">
                  <Building2 aria-hidden="true" className="payg__icon" />
                  <span className="payg__text">
                    <span className="payg__name">University Concierge</span>
                    <span className="payg__detail">We apply for you, plus the university’s form fee</span>
                  </span>
                  <span className="payg__price">from {formatMoney(2000, 'GHS')}</span>
                  <ChevronRight aria-hidden="true" className="payg__go" />
                </Link>
              </li>
            </ul>
          </motion.section>
        )}
      </div>
    </PageTransition>
  );
}
