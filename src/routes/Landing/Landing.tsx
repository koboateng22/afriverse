import { motion } from 'framer-motion';
import { ArrowRight, BookOpenCheck, GraduationCap, Users } from 'lucide-react';
import { PageTransition } from '../../components/PageTransition/PageTransition';
import { ButtonLink } from '../../components/Button/Button';
import { Emblem, Logo } from '../../components/Logo/Logo';
import { homeFor, useAuth } from '../../features/auth/useAuth';
import { riseItem, staggerParent } from '../../lib/motion';
import './Landing.css';

const PILLARS = [
  { icon: GraduationCap, title: 'Scholarships, matched', body: 'Real deadlines from Chevening, Mastercard Foundation, DAAD and more — sorted by what fits you.' },
  { icon: BookOpenCheck, title: 'Learn inside the app', body: 'Short video courses with an AI tutor that answers questions about the lesson you are watching.' },
  { icon: Users, title: 'Mentors and applications', body: 'Book people who have done it, or let us handle your university application end to end.' },
];

export default function Landing() {
  const { session, profile } = useAuth();
  const signedIn = Boolean(session && profile);

  return (
    <PageTransition bare label="Afriversity">
      <div className="container landing">
        <header className="landing__bar">
          <Logo />
          {!signedIn && (
            <ButtonLink to="/login" variant="quiet" size="sm">
              Sign in
            </ButtonLink>
          )}
        </header>

        <motion.section className="landing__hero" variants={staggerParent} initial="hidden" animate="show">
          <motion.div className="landing__emblem" variants={riseItem}>
            <Emblem size={88} />
          </motion.div>
          <motion.p className="eyebrow" variants={riseItem}>
            Discover · Apply · Achieve
          </motion.p>
          <motion.h1 className="landing__title" variants={riseItem}>
            Find your <span className="landing__accent">next door</span> — and walk through it.
          </motion.h1>
          <motion.p className="landing__lede" variants={riseItem}>
            Afriversity brings scholarships, short courses, mentors and university applications into one calm place.
          </motion.p>
          <motion.div variants={riseItem}>
            {signedIn ? (
              <ButtonLink to={homeFor(profile)} size="lg" iconEnd={<ArrowRight aria-hidden="true" />}>
                Continue to your feed
              </ButtonLink>
            ) : (
              <ButtonLink to="/signup" size="lg" iconEnd={<ArrowRight aria-hidden="true" />}>
                Get started — it's free
              </ButtonLink>
            )}
          </motion.div>
        </motion.section>

        <motion.ul className="landing__pillars" role="list" variants={staggerParent} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.3 }}>
          {PILLARS.map(({ icon: Icon, title, body }) => (
            <motion.li key={title} className="landing__pillar" variants={riseItem}>
              <Icon aria-hidden="true" />
              <h2>{title}</h2>
              <p>{body}</p>
            </motion.li>
          ))}
        </motion.ul>
      </div>
    </PageTransition>
  );
}
