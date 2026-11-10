import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { BadgeCheck, Check, Copy, Hourglass, MessageCircle, Sparkles, UsersRound, type LucideIcon } from 'lucide-react';
import { PageTransition } from '../../components/PageTransition/PageTransition';
import { PageHeader } from '../../components/PageHeader/PageHeader';
import { Button } from '../../components/Button/Button';
import { CountUp } from '../../components/CountUp/CountUp';
import { EmptyState } from '../../components/EmptyState/EmptyState';
import { Notice } from '../../components/Notice/Notice';
import { Skeleton } from '../../components/Skeleton/Skeleton';
import { fetchAmbassadorStats, referralLink, whatsappShareUrl, type AmbassadorStats } from '../../features/ambassador/api';
import { formatMoney } from '../../lib/money';
import { errorMessage } from '../../lib/supabase';
import { riseItem, staggerParent } from '../../lib/motion';
import './AmbassadorHub.css';

const cedis = (cents: number) => formatMoney(Math.round(cents), 'GHS');

type Stat = { label: string; value: number; icon: LucideIcon; tone: 'plain' | 'gold' | 'emerald'; money?: boolean; hint: string };

/** Campus Ambassadors: their referral code, sign-ups, upgrades and earnings. Payouts are manual (admin, MoMo). */
export default function AmbassadorHub() {
  const [stats, setStats] = useState<AmbassadorStats | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchAmbassadorStats()
      .then(setStats)
      .catch((e) => {
        setError(errorMessage(e));
        setStats(null);
      });
  }, []);

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(t);
  }, [copied]);

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setError('Copying is blocked in this browser. Press and hold the code to copy it.');
    }
  };

  const tiles: Stat[] = stats
    ? [
        { label: 'Total sign-ups', value: stats.signups, icon: UsersRound, tone: 'plain', hint: 'Joined with your code' },
        { label: 'Pro upgrades', value: stats.upgrades, icon: Sparkles, tone: 'plain', hint: 'Paid for Pro' },
        { label: 'Pending earnings', value: stats.pending_cents, icon: Hourglass, tone: 'gold', money: true, hint: 'Paid at month end' },
        { label: 'Total paid out', value: stats.paid_cents, icon: BadgeCheck, tone: 'emerald', money: true, hint: 'Sent to your MoMo' },
      ]
    : [];

  return (
    <PageTransition label="Ambassador Hub">
      <div className="container amb">
        <PageHeader
          back={{ to: '/profile', label: 'You' }}
          artTone="gold"
          eyebrow="Campus Ambassador"
          title="Ambassador Hub"
          lede="Share your code. Every friend who joins with it and goes Pro earns you GH₵ 5."
        />

        {error && <Notice tone="error">{error}</Notice>}

        {stats === undefined && (
          <div className="amb__loading">
            <Skeleton shape="block" height="190px" label="Loading your Ambassador Hub" />
            <Skeleton shape="block" height="220px" />
          </div>
        )}

        {stats === null && !error && (
          <EmptyState icon={UsersRound} title="The Ambassador Hub is for Campus Ambassadors" action={<Link className="btn" data-variant="secondary" to="/profile">Back to your profile</Link>}>
            <p>Ambassadors share Afriversity on campus and earn for every friend who goes Pro. Ask the Afriversity team if you'd like to join.</p>
          </EmptyState>
        )}

        {stats && (
          <motion.div className="amb__body" variants={staggerParent} initial="hidden" animate="show">
            <motion.section className="amb-code" variants={riseItem} aria-labelledby="amb-code-h">
              <span className="amb-code__halo" aria-hidden="true" />
              <div className="amb-code__card">
                <h2 id="amb-code-h" className="amb-code__label">Your referral code</h2>
                <p className="amb-code__value" translate="no">{stats.referral_code}</p>
                <p className="amb-code__link">{referralLink(stats.referral_code).replace(/^https?:\/\//, '')}</p>
                <div className="amb-code__actions">
                  <Button variant="secondary" icon={copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />} onClick={() => void copy(stats.referral_code)}>
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                  <a className="btn amb-code__wa" data-variant="gold" href={whatsappShareUrl(stats.referral_code)} target="_blank" rel="noopener noreferrer">
                    <MessageCircle aria-hidden="true" /> Share to WhatsApp
                  </a>
                </div>
                <span className="visually-hidden" aria-live="polite">{copied ? 'Code copied' : ''}</span>
              </div>
            </motion.section>

            <motion.ul className="amb-stats" role="list" variants={riseItem}>
              {tiles.map(({ label, value, icon: Icon, tone, money, hint }) => (
                <li key={label} className="amb-stat" data-tone={tone}>
                  <span className="amb-stat__icon" aria-hidden="true">
                    <Icon />
                  </span>
                  <span className="amb-stat__value">
                    <CountUp value={value} format={money ? cedis : (n) => String(Math.round(n))} />
                  </span>
                  <span className="amb-stat__label">{label}</span>
                  <span className="amb-stat__hint">{hint}</span>
                </li>
              ))}
            </motion.ul>

            <motion.div variants={riseItem}>
              <Notice tone="info">
                Payouts are processed manually at the end of every month. Please post your dashboard screenshot in the Ambassador WhatsApp group to claim.
              </Notice>
            </motion.div>

            <motion.section className="amb-how" variants={riseItem} aria-labelledby="amb-how-h">
              <h2 id="amb-how-h" className="amb-how__title">How you earn</h2>
              <ol className="amb-how__steps">
                <li><b>1</b> Share your code or link with friends on campus.</li>
                <li><b>2</b> They type your code under “Have a referral code?” when they sign up.</li>
                <li><b>3</b> When they upgrade to Pro, GH₵ 5 lands in your pending earnings.</li>
                <li><b>4</b> At month end the team sends it to your MoMo and it moves to paid out.</li>
              </ol>
            </motion.section>
          </motion.div>
        )}
      </div>
    </PageTransition>
  );
}
