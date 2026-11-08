import { useState } from 'react';
import { motion } from 'framer-motion';
import { BadgeCheck } from 'lucide-react';
import { PageTransition } from '../../components/PageTransition/PageTransition';
import { PageHeader } from '../../components/PageHeader/PageHeader';
import { Button } from '../../components/Button/Button';
import { Notice } from '../../components/Notice/Notice';
import { ProOffer } from '../../features/billing/ProOffer';
import { usePlan } from '../../features/billing/PlanProvider';
import { cancelAutoRenew, cardManageLink } from '../../features/billing/api';
import { formatDay } from '../../lib/dates';
import { errorMessage } from '../../lib/supabase';
import { riseItem } from '../../lib/motion';
import './Paywall.css';

export default function Paywall() {
  const { isPro, current, billing, refresh } = usePlan();
  const [busy, setBusy] = useState<'cancel' | 'card' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const autoRenew = billing?.status === 'active';
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
          lede={isPro ? undefined : 'The AI tools are free for everyone. Pro adds people: a counsellor on WhatsApp, CV and essay strategy sessions, and priority support.'}
        />

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
      </div>
    </PageTransition>
  );
}
