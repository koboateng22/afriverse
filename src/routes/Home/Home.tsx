import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, RotateCcw, Sparkles, UserRoundPen } from 'lucide-react';
import { PageTransition } from '../../components/PageTransition/PageTransition';
import { Button } from '../../components/Button/Button';
import { Notice } from '../../components/Notice/Notice';
import { HeaderArt, useHeaderParallax } from '../../components/PageHeader/HeaderArt';
import { fetchOpportunities } from '../../features/opportunities/api';
import { useMatches } from '../../features/opportunities/matcher';
import type { Opportunity } from '../../features/opportunities/types';
import { buildTopMatches } from '../../features/home/topMatches';
import { RenewalBanner } from '../../features/billing/RenewalBanner';
import { useAuth } from '../../features/auth/useAuth';
import { errorMessage } from '../../lib/supabase';
import { riseItem, staggerParent } from '../../lib/motion';
import { TopMatches } from './TopMatches';
import './Home.css';

/**
 * /home — deliberately short: a greeting, the student's 3–5 strongest matches, and one
 * way into the full list (/discover). Everything else lives one tap away.
 */
export default function Home() {
  const { profile } = useAuth();
  const { matches } = useMatches();
  const [items, setItems] = useState<Opportunity[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const parallax = useHeaderParallax();

  const load = useCallback(() => {
    setError(null);
    setItems(null);
    fetchOpportunities()
      .then(setItems)
      .catch((e) => setError(errorMessage(e)));
  }, []);
  useEffect(load, [load]);

  const firstName = profile?.full_name?.trim().split(/\s+/)[0];
  const top = useMemo(() => (items ? buildTopMatches({ opportunities: items, matches, profile }) : []), [items, matches, profile]);

  return (
    <PageTransition label="Home">
      <div className="container home" data-wide>
        <motion.header ref={parallax.ref} className="home__header" variants={staggerParent} initial="hidden" animate="show">
          <HeaderArt y={parallax.artY} scale={parallax.artScale} />
          <motion.div className="home__header-text" style={{ y: parallax.textY, opacity: parallax.textOpacity }}>
            <motion.h1 className="home__title" variants={riseItem}>
              Welcome back{firstName ? `, ${firstName}` : ''}{' '}
              <span className="home__wave" aria-hidden="true">
                👋
              </span>
            </motion.h1>
            <motion.p className="home__lede" variants={riseItem}>
              Here are your top matches for today.
            </motion.p>
          </motion.div>
        </motion.header>

        {error ? (
          <Notice tone="error" action={<Button variant="secondary" size="sm" icon={<RotateCcw aria-hidden="true" />} onClick={load}>Retry</Button>}>
            We couldn't load your matches: {error}
          </Notice>
        ) : items && top.length === 0 ? (
          <motion.section className="home__empty" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} aria-labelledby="home-empty-h">
            <span className="home__empty-icon" aria-hidden="true">
              <Sparkles />
            </span>
            <h2 id="home-empty-h" className="home__empty-title">
              We are finding more opportunities for you
            </h2>
            <p className="home__empty-text">Update your profile to get better matches!</p>
            <Link className="btn" data-variant="secondary" to="/profile">
              <UserRoundPen aria-hidden="true" /> Update your profile
            </Link>
          </motion.section>
        ) : (
          <TopMatches items={top} loading={!items} />
        )}

        <Link to="/discover" className="home__explore">
          <span>
            <span className="home__explore-title">Explore All Opportunities</span>
            <span className="home__explore-sub">Every scholarship, internship and programme, with filters</span>
          </span>
          <ArrowRight aria-hidden="true" className="home__explore-arrow" />
        </Link>

        <RenewalBanner />
      </div>
    </PageTransition>
  );
}
