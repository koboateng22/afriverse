import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowUpRight, Check, Info, Lock, SearchX, Sparkles } from 'lucide-react';
import { PageTransition } from '../../components/PageTransition/PageTransition';
import { PageHeader } from '../../components/PageHeader/PageHeader';
import { Tag } from '../../components/Chip/Chip';
import { Countdown } from '../../components/Countdown/Countdown';
import { Skeleton } from '../../components/Skeleton/Skeleton';
import { EmptyState } from '../../components/EmptyState/EmptyState';
import { Notice } from '../../components/Notice/Notice';
import { SaveButton } from '../../features/opportunities/SaveButton';
import { fetchOpportunity, fetchProInsights } from '../../features/opportunities/api';
import { useMatches } from '../../features/opportunities/matcher';
import { usePaywall } from '../../features/billing/PaywallModal';
import { useSaved } from '../../features/opportunities/saved';
import { FUNDING_LABEL, type Opportunity } from '../../features/opportunities/types';
import { usePlan } from '../../features/billing/PlanProvider';
import { useAuth } from '../../features/auth/useAuth';
import { countdownFor, formatDay } from '../../lib/dates';
import { errorMessage } from '../../lib/supabase';
import { lift, press, riseItem, staggerParent } from '../../lib/motion';
import './OpportunityDetail.css';

/** Placeholder bars rendered under the blur — the real guide never reaches non-Pro browsers. */
function LockedGuide() {
  return (
    <div className="pro-guide__locked" aria-hidden="true">
      {[92, 78, 85, 64].map((w) => (
        <span key={w} className="pro-guide__bar" data-w={w} />
      ))}
    </div>
  );
}

export default function OpportunityDetail() {
  const { id = '' } = useParams();
  const { profile } = useAuth();
  const { plan, loading: planLoading } = usePlan();
  const { matches } = useMatches();
  const { openPaywall } = usePaywall();
  const { saved, toggle } = useSaved(profile?.id);
  const [o, setO] = useState<Opportunity | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [insights, setInsights] = useState<string[] | null>(null);

  useEffect(() => {
    fetchOpportunity(id)
      .then(setO)
      .catch((e) => setError(errorMessage(e)));
  }, [id]);

  // Pro gating is decided by active_plan() on the server; we only ask when it says pro.
  useEffect(() => {
    if (!o?.is_pro || plan !== 'pro') return;
    fetchProInsights(o.id)
      .then(setInsights)
      .catch((e) => setError(errorMessage(e)));
  }, [o, plan]);

  if (o === null) {
    return (
      <PageTransition label="Not found">
        <div className="container">
          <PageHeader back={{ to: '/home', label: 'Discover' }} title="Opportunity not found" />
          <EmptyState icon={SearchX} title="This opportunity isn't listed any more">
            <p>It may have been removed or unpublished.</p>
          </EmptyState>
        </div>
      </PageTransition>
    );
  }

  const countdown = o ? countdownFor(o) : null;
  const canApply = o && (o.status === 'open' || o.status === 'rolling');
  const match = o ? matches?.get(o.id) : undefined;

  return (
    <PageTransition label={o?.title ?? 'Opportunity'}>
      <div className="container opp">
        <PageHeader
          back={{ to: '/home', label: 'Discover' }}
          eyebrow={o?.provider ?? ' '}
          title={o?.title ?? 'Loading…'}
          aside={o ? <SaveButton saved={saved.has(o.id)} onToggle={() => void toggle(o.id)} label={o.title} /> : undefined}
        />
        {error && <Notice tone="error">{error}</Notice>}

        {!o || !countdown ? (
          <div className="opp__loading">
            <Skeleton shape="block" height="96px" label="Loading opportunity" />
            <Skeleton width="90%" />
            <Skeleton width="70%" />
          </div>
        ) : (
          <motion.div className="opp__body" variants={staggerParent} initial="hidden" animate="show">
            <motion.div className="opp__tags" variants={riseItem}>
              {match && <span className="opp__match">{match.score}% match</span>}
              <Tag tone={countdown.tone}>{countdown.label}</Tag>
              <Tag>{FUNDING_LABEL[o.funding]}</Tag>
              <Tag>{o.host_country}</Tag>
            </motion.div>

            {o.status === 'open' && o.deadline && (
              <motion.section variants={riseItem} aria-label="Time left to apply" className="opp__countdown">
                <p className="eyebrow">Closes {formatDay(o.deadline)}</p>
                <Countdown deadline={o.deadline} />
              </motion.section>
            )}

            <motion.p variants={riseItem} className="opp__desc">
              {o.description}
            </motion.p>

            {o.cycle_note && (
              <motion.div variants={riseItem}>
                <Notice tone="info">{o.cycle_note}</Notice>
              </motion.div>
            )}

            <motion.section variants={riseItem} className="opp__section" aria-labelledby="elig-h">
              <h2 id="elig-h">Who can apply</h2>
              <p className="opp__open-to">{o.open_to}</p>
              <ul role="list" className="opp__list">
                {o.eligibility.map((e) => (
                  <li key={e}>
                    <Check aria-hidden="true" />
                    <span>{e}</span>
                  </li>
                ))}
              </ul>
            </motion.section>

            <motion.section variants={riseItem} className="opp__section" aria-labelledby="ben-h">
              <h2 id="ben-h">What you get</h2>
              <ul role="list" className="opp__list">
                {o.benefits.map((b) => (
                  <li key={b}>
                    <Check aria-hidden="true" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </motion.section>

            {o.is_pro && (
              <motion.section variants={riseItem} className="pro-guide" data-locked={plan !== 'pro' || undefined} aria-labelledby="pro-h">
                <div className="pro-guide__head">
                  <Sparkles aria-hidden="true" />
                  <h2 id="pro-h">Insider application guide</h2>
                  <Tag tone="gold">Pro</Tag>
                </div>
                {plan === 'pro' ? (
                  insights ? (
                    <ol className="pro-guide__list">
                      {insights.map((t) => (
                        <li key={t}>{t}</li>
                      ))}
                    </ol>
                  ) : (
                    <Skeleton width="100%" height="60px" shape="block" label="Loading guide" />
                  )
                ) : planLoading ? null : (
                  <>
                    <LockedGuide />
                    <div className="pro-guide__upsell">
                      <Lock aria-hidden="true" />
                      <p>Step-by-step tips drawn from this programme's own rules — included with Pro.</p>
                      <button type="button" className="pro-guide__cta" onClick={() => openPaywall('Insider application guides are part of Pro.')}>
                        Unlock with Pro
                      </button>
                    </div>
                  </>
                )}
              </motion.section>
            )}

            <motion.div variants={riseItem} className="opp__actions">
              <motion.a
                href={o.url}
                target="_blank"
                rel="noopener noreferrer"
                className="opp__apply"
                data-muted={canApply ? undefined : true}
                whileHover={lift}
                whileTap={press}
              >
                {canApply ? 'Apply on the official site' : 'View the official page'}
                <ArrowUpRight aria-hidden="true" />
              </motion.a>
              <p className="opp__verified">
                <Info aria-hidden="true" /> Details checked against the official page. Always confirm dates there before applying.
              </p>
            </motion.div>
          </motion.div>
        )}
      </div>
    </PageTransition>
  );
}
