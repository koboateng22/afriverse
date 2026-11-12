import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowUpRight, Building2, Check, FileText, GraduationCap, MapPin } from 'lucide-react';
import { PageTransition } from '../../components/PageTransition/PageTransition';
import { PageHeader } from '../../components/PageHeader/PageHeader';
import { Button } from '../../components/Button/Button';
import { EmptyState } from '../../components/EmptyState/EmptyState';
import { Notice } from '../../components/Notice/Notice';
import { Skeleton } from '../../components/Skeleton/Skeleton';
import { fetchUniversity } from '../../features/universities/api';
import { feeOf, requirementsOf, type University } from '../../features/universities/types';
import { OwnershipBadge } from '../../features/universities/OwnershipBadge';
import { UniLogo } from '../../features/universities/UniLogo';
import { fetchOpenApplication } from '../../features/applications/api';
import { useAuth } from '../../features/auth/useAuth';
import { ResultsStrip } from '../../features/results/ResultsStrip';
import { useMyResults } from '../../features/results/useMyResults';
import { startCheckout } from '../../features/billing/paystack';
import { FunctionError } from '../../lib/functions';
import { formatMoney } from '../../lib/money';
import { errorMessage } from '../../lib/supabase';
import { riseItem, staggerParent } from '../../lib/motion';
import './UniversityDetail.css';

export default function UniversityDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [uni, setUni] = useState<University | null | undefined>(undefined);
  const [openAppId, setOpenAppId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { profile } = useAuth();
  const { results } = useMyResults(profile?.id);

  useEffect(() => {
    fetchUniversity(id)
      .then(async (u) => {
        setUni(u && u.active ? u : null);
        if (u) setOpenAppId((await fetchOpenApplication(u.id))?.id ?? null);
      })
      .catch((e) => setError(errorMessage(e)));
  }, [id]);

  if (uni === null) {
    return (
      <PageTransition label="University not available">
        <div className="container">
          <PageHeader back={{ to: '/apply-university', label: 'Universities' }} title="Not accepting applications" />
          <EmptyState icon={Building2} title="This university isn't open through Afriversity">
            <p>Pick another university from the list.</p>
          </EmptyState>
        </div>
      </PageTransition>
    );
  }

  const pay = async () => {
    if (!uni) return;
    setBusy(true);
    setError(null);
    try {
      // Amount is NOT sent — paystack-init reads this university's GHS fee from the database.
      await startCheckout({ type: 'application', university_id: uni.id });
    } catch (e) {
      if (e instanceof FunctionError && e.code === 'form_pending' && typeof e.body.application_id === 'string') {
        navigate(`/applications/${e.body.application_id}/complete`);
        return;
      }
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  const needs = uni ? requirementsOf(uni.form_fields ?? {}) : [];

  return (
    <PageTransition label={uni?.name ?? 'University'}>
      <div className="container uni">
        <PageHeader back={{ to: '/apply-university', label: 'Universities' }} eyebrow="University concierge" title={uni?.name ?? 'Loading…'} />

        {!uni ? (
          <Skeleton shape="block" height="220px" label="Loading university" />
        ) : (
          <motion.div className="uni__body" variants={staggerParent} initial="hidden" animate="show">
            <motion.div className="uni__hero" variants={riseItem} data-cover={uni.cover_image_url ? '' : undefined}>
              {uni.cover_image_url && <img className="uni__cover" src={uni.cover_image_url} alt="" loading="lazy" decoding="async" onError={(e) => { e.currentTarget.hidden = true; }} />}
              <UniLogo u={uni} size="lg" />
            </motion.div>
            <ResultsStrip results={results} cutoffLink={uni.cutoff_link} />
            <motion.div className="uni__meta" variants={riseItem}>
              <p className="uni__where">
                <MapPin aria-hidden="true" /> {uni.city}, {uni.country}
              </p>
              <OwnershipBadge u={uni} long />
            </motion.div>
            {uni.description && (
              <motion.p className="uni__desc" variants={riseItem}>
                {uni.description}
              </motion.p>
            )}

            {(uni.programmes?.length ?? 0) > 0 && (
              <motion.section className="uni__section" variants={riseItem} aria-labelledby="prog-h">
                <h2 id="prog-h">Programmes</h2>
                <ul role="list" className="uni__progs">
                  {uni.programmes!.map((p) => (
                    <li key={p}>
                      <GraduationCap aria-hidden="true" /> {p}
                    </li>
                  ))}
                </ul>
              </motion.section>
            )}
            {uni.admission_requirements && (
              <motion.section className="uni__section" variants={riseItem} aria-labelledby="adm-h">
                <h2 id="adm-h">Admission requirements</h2>
                <p className="uni__prose">{uni.admission_requirements}</p>
              </motion.section>
            )}
            {uni.tuition_info && (
              <motion.section className="uni__section" variants={riseItem} aria-labelledby="tui-h">
                <h2 id="tui-h">Tuition</h2>
                <p className="uni__prose">{uni.tuition_info}</p>
              </motion.section>
            )}
            {(uni.admission_requirements || uni.tuition_info) && (
              <motion.p className="uni__fine" variants={riseItem}>Requirements and fees can change each year. Confirm them on the official website before you apply.</motion.p>
            )}

            <motion.section className="uni__fee" variants={riseItem} aria-labelledby="fee-h">
              <h2 id="fee-h" className="uni__fee-label">
                What you pay
              </h2>
              <p className="uni__fee-amount">{formatMoney(feeOf(uni), 'GHS')}</p>
              <dl className="uni__fee-parts">
                <div>
                  <dt>University fee</dt>
                  <dd>{formatMoney(uni.app_fee_cents, 'GHS')}</dd>
                </div>
                <div>
                  <dt>Service fee</dt>
                  <dd>{uni.service_fee_cents > 0 ? formatMoney(uni.service_fee_cents, 'GHS') : 'None'}</dd>
                </div>
              </dl>
              <p className="uni__pitch">Skip the bank queues. We buy the voucher and submit the forms for you.</p>
              {uni.fee_notes && <p className="uni__fee-note">{uni.fee_notes}</p>}
            </motion.section>

            <motion.section className="uni__section" variants={riseItem} aria-labelledby="need-h">
              <h2 id="need-h">After you pay, you'll provide</h2>
              <ul role="list" className="uni__list">
                {['Your full name, email and phone (filled in for you)', 'The programme you want to study', ...needs].map((n) => (
                  <li key={n}>
                    {n.includes('(upload)') ? <FileText aria-hidden="true" /> : <Check aria-hidden="true" />}
                    <span>{n}</span>
                  </li>
                ))}
              </ul>
            </motion.section>

            {uni.website && (
              <motion.a variants={riseItem} className="uni__site" href={uni.website} target="_blank" rel="noopener noreferrer">
                Official website <ArrowUpRight aria-hidden="true" />
              </motion.a>
            )}

            {error && <Notice tone="error">{error}</Notice>}

            {openAppId ? (
              <Button size="lg" block onClick={() => navigate(`/applications/${openAppId}/complete`)}>
                Complete your application
              </Button>
            ) : (
              <Button variant="gold" size="lg" block loading={busy} onClick={pay}>
                Pay {formatMoney(feeOf(uni), 'GHS')} · we handle the rest
              </Button>
            )}
            <p className="uni__fine">Mobile Money or card, secured by Paystack. Your fee is locked once you pay.</p>
          </motion.div>
        )}
      </div>
    </PageTransition>
  );
}
