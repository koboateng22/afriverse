import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Building2, MapPin } from 'lucide-react';
import { PageTransition } from '../../components/PageTransition/PageTransition';
import { PageHeader } from '../../components/PageHeader/PageHeader';
import { ListSkeleton } from '../../components/Skeleton/Skeleton';
import { EmptyState } from '../../components/EmptyState/EmptyState';
import { Notice } from '../../components/Notice/Notice';
import { fetchUniversities } from '../../features/universities/api';
import { feeOf, type University } from '../../features/universities/types';
import { formatMoney } from '../../lib/money';
import { errorMessage } from '../../lib/supabase';
import { lift, press, riseItem, staggerParent } from '../../lib/motion';
import './ApplyUniversity.css';

const MotionLink = motion.create(Link);

export default function ApplyUniversity() {
  const [unis, setUnis] = useState<University[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchUniversities()
      .then(setUnis)
      .catch((e) => setError(errorMessage(e)));
  }, []);

  return (
    <PageTransition label="Apply to university">
      <div className="container apply-list">
        <PageHeader
          back={{ to: '/profile', label: 'You' }}
          eyebrow="University concierge"
          title="We'll handle your application"
          lede="Pick a university and pay its application fee. Then complete one short form and our team submits your application for you."
        />
        {error && <Notice tone="error">{error}</Notice>}
        {!unis && !error && (
          <ListSkeleton kind="card" count={3} label="Loading universities" className="apply-list__grid" />
        )}
        {unis && unis.length === 0 && (
          <EmptyState icon={Building2} title="No universities open right now">
            <p>The team adds universities as their application windows open.</p>
          </EmptyState>
        )}
        {unis && unis.length > 0 && (
          <motion.div className="apply-list__grid" variants={staggerParent} initial="hidden" animate="show">
            {unis.map((u) => (
              <MotionLink key={u.id} to={`/apply-university/${u.slug}`} className="uni-card" variants={riseItem} whileHover={lift} whileTap={press}>
                <span className="uni-card__mono" aria-hidden="true">
                  {u.short_name ?? u.name.slice(0, 3)}
                </span>
                <span className="uni-card__text">
                  <span className="uni-card__name">{u.name}</span>
                  <span className="uni-card__where">
                    <MapPin aria-hidden="true" /> {u.city}, {u.country}
                  </span>
                </span>
                <span className="uni-card__price">
                  <span className="uni-card__total">{formatMoney(feeOf(u), 'GHS')}</span>
                  <span className="uni-card__all-in">application fee</span>
                </span>
                <ArrowRight className="uni-card__go" aria-hidden="true" />
              </MotionLink>
            ))}
          </motion.div>
        )}
      </div>
    </PageTransition>
  );
}
