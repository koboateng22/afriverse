import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Check, FileText, Lock, X } from 'lucide-react';
import { PageTransition } from '../../components/PageTransition/PageTransition';
import { PageHeader } from '../../components/PageHeader/PageHeader';
import { ButtonLink } from '../../components/Button/Button';
import { ListSkeleton } from '../../components/Skeleton/Skeleton';
import { EmptyState } from '../../components/EmptyState/EmptyState';
import { Notice } from '../../components/Notice/Notice';
import { fetchMyApplications, type ApplicationWithUniversity } from '../../features/applications/api';
import type { ApplicationStatus } from '../../features/applications/types';
import { usePlan } from '../../features/billing/PlanProvider';
import { usePaywall } from '../../features/billing/PaywallModal';
import { formatMoney } from '../../lib/money';
import { errorMessage } from '../../lib/supabase';
import { riseItem, staggerParent } from '../../lib/motion';
import './Applications.css';

const STAGES = ['Paid', 'Form sent', 'In review', 'Decision'] as const;

/** Index of the furthest stage reached for a status. */
function stageOf(s: ApplicationStatus): number {
  switch (s) {
    case 'Pending Payment':
    case 'Failed':
      return -1;
    case 'Paid':
      return 0;
    case 'Submitted':
      return 1;
    case 'In Review':
      return 2;
    default:
      return 3; // Offer / Rejected / Withdrawn
  }
}

const STATUS_COPY: Record<ApplicationStatus, string> = {
  'Pending Payment': 'Waiting for payment',
  Paid: 'Paid — complete your application form so we can start',
  Failed: 'Payment not completed',
  Submitted: 'Your concierge is preparing the application',
  'In Review': 'Submitted to the university and under review',
  Offer: 'Offer received — congratulations!',
  Rejected: 'Not successful this time',
  Withdrawn: 'Withdrawn',
};

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '');

export default function Applications() {
  const { isPro } = usePlan();
  const { openPaywall } = usePaywall();
  const location = useLocation();
  const justSubmitted = (location.state as { submitted?: string } | null)?.submitted;
  const [apps, setApps] = useState<ApplicationWithUniversity[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMyApplications()
      .then((a) => setApps(a.filter((x) => x.status !== 'Pending Payment')))
      .catch((e) => setError(errorMessage(e)));
  }, []);

  return (
    <PageTransition label="My applications">
      <div className="container apps">
        <PageHeader back={{ to: '/profile', label: 'You' }} eyebrow="Concierge" title="My applications" />
        {justSubmitted && <Notice tone="success">Application submitted. Your concierge will be in touch if anything else is needed.</Notice>}
        {error && <Notice tone="error">{error}</Notice>}
        {!apps && !error && <ListSkeleton kind="application" count={2} label="Loading your applications" />}
        {apps && apps.length === 0 && (
          <EmptyState icon={FileText} title="No applications yet" action={<ButtonLink to="/apply-university">Choose a university</ButtonLink>}>
            <p>Pay a university's application fee and our team will apply for you.</p>
          </EmptyState>
        )}
        {apps && apps.length > 0 && (
          <motion.ul className="apps__list" role="list" variants={staggerParent} initial="hidden" animate="show">
            {apps.map((a) => {
              const stage = stageOf(a.status);
              const negative = a.status === 'Rejected' || a.status === 'Withdrawn' || a.status === 'Failed';
              return (
                <motion.li key={a.id} className="app-card" variants={riseItem} data-status={a.status}>
                  <div className="app-card__head">
                    <div className="app-card__titles">
                      <p className="app-card__uni">{a.university?.name ?? 'University'}</p>
                      <h2 className="app-card__program">{a.program ?? 'Programme to be confirmed'}</h2>
                      {a.intake && <p className="app-card__intake">{a.intake}</p>}
                    </div>
                    <span className="app-card__status" data-negative={negative || undefined}>
                      {a.status}
                    </span>
                  </div>

                  <p className="app-card__copy">{STATUS_COPY[a.status]}</p>

                  {a.status === 'Paid' && (
                    <Link to={`/applications/${a.id}/complete`} className="app-card__cta">
                      Complete your application <ArrowRight aria-hidden="true" />
                    </Link>
                  )}

                  {/* Application Tracker (Pro): full timeline with dates + counsellor notes. */}
                  {stage >= 0 && isPro && (
                    <>
                      <ol className="timeline" aria-label="Progress">
                        {STAGES.map((label, i) => {
                          const done = i <= stage;
                          const isDecision = i === 3 && stage === 3;
                          const date = i === 0 ? when(a.created_at) : i === 1 ? when(a.submitted_at) : i === stage ? when(a.updated_at) : '';
                          return (
                            <li key={label} className="timeline__step" data-done={done || undefined} data-negative={isDecision && negative ? true : undefined}>
                              <motion.span className="timeline__dot" initial={done ? { scale: 0.4 } : false} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 18, delay: i * 0.08 }}>
                                {done && (isDecision && negative ? <X aria-hidden="true" /> : <Check aria-hidden="true" />)}
                              </motion.span>
                              <span className="timeline__label">{isDecision ? a.status : label}</span>
                              {done && date && <span className="timeline__date">{date}</span>}
                            </li>
                          );
                        })}
                      </ol>
                      {a.status_note && <p className="app-card__note">“{a.status_note}” — your counsellor</p>}
                    </>
                  )}
                  {stage >= 1 && !isPro && (
                    <button type="button" className="app-card__locked" onClick={() => openPaywall('The Application Tracker shows every step with dates and notes from your counsellor. It’s part of Pro.')}>
                      <Lock aria-hidden="true" /> See the full timeline and counsellor notes with Pro
                    </button>
                  )}

                  <dl className="app-card__fees">
                    <div>
                      <dt>Application fee paid</dt>
                      <dd>{stage >= 0 ? formatMoney(a.total_cents, a.currency) : '—'}</dd>
                    </div>
                    {a.payment_ref && (
                      <div>
                        <dt>Reference</dt>
                        <dd className="app-card__ref">{a.payment_ref}</dd>
                      </div>
                    )}
                  </dl>
                </motion.li>
              );
            })}
          </motion.ul>
        )}
      </div>
    </PageTransition>
  );
}
