import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { PageTransition } from '../../components/PageTransition/PageTransition';
import { ButtonLink } from '../../components/Button/Button';
import { Logo } from '../../components/Logo/Logo';
import { SiteFooter } from '../../components/SiteFooter/SiteFooter';
import { riseItem, staggerParent } from '../../lib/motion';
import './TeamPage.css';

const SITE = 'https://www.afriversity.com';

export const TEAM = [
  { name: 'Abel Kwadwo Boateng', title: 'Founder & CEO' },
  { name: 'Victor Xorse', title: 'Co-founder & Senior Fullstack Engineer' },
  { name: 'Kwadwo Oppong Boateng', title: 'Fullstack, DevOps' },
  { name: 'Victoria Asomani', title: 'Backend Engineer' },
  { name: 'Forson Daapeneh', title: 'Outreach & Partnerships' },
  { name: 'Lydia Acquah', title: 'Media & Publicity' },
] as const;

const INTRO =
  'Meet the builders behind Afriversity. We are a team of passionate engineers, creators, and advocates dedicated to building the operating system for the African student.';

/** "Abel Kwadwo Boateng" → "AB" (first and last name). */
const initials = (name: string) => {
  const parts = name.trim().split(/\s+/);
  return `${parts[0]?.[0] ?? ''}${parts.length > 1 ? parts[parts.length - 1][0] : ''}`.toUpperCase();
};

/** JSON-LD for Google: the organisation and a Person for each member, each worksFor Afriversity. */
export function teamJsonLd() {
  const org = { '@type': 'Organization', '@id': `${SITE}/#organization`, name: 'Afriversity', url: `${SITE}/` };
  return {
    '@context': 'https://schema.org',
    '@graph': [
      org,
      ...TEAM.map((m) => ({
        '@type': 'Person',
        name: m.name,
        jobTitle: m.title,
        worksFor: { '@id': org['@id'], '@type': 'Organization', name: 'Afriversity', url: `${SITE}/` },
        url: `${SITE}/team`,
      })),
    ],
  };
}

/** Puts the team's JSON-LD, title and description in <head> while the page is open. */
function useTeamHead() {
  useEffect(() => {
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.id = 'team-jsonld';
    script.textContent = JSON.stringify(teamJsonLd());
    document.head.appendChild(script);

    const prevTitle = document.title;
    document.title = 'Our team — Afriversity';
    const desc = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const prevDesc = desc?.content;
    if (desc) desc.content = INTRO;

    return () => {
      script.remove();
      document.title = prevTitle;
      if (desc && prevDesc !== undefined) desc.content = prevDesc;
    };
  }, []);
}

/** /team — the people behind Afriversity (public). */
export default function TeamPage() {
  useTeamHead();
  return (
    <PageTransition bare label="Our team">
      <div className="container team">
        <header className="team__bar">
          <Logo />
          <ButtonLink to="/signup" variant="quiet" size="sm">
            Join Afriversity
          </ButtonLink>
        </header>

        <motion.section className="team__hero" variants={staggerParent} initial="hidden" animate="show" aria-labelledby="team-h">
          <motion.p className="eyebrow" variants={riseItem}>
            Our team
          </motion.p>
          <motion.h1 id="team-h" className="team__title" variants={riseItem}>
            The people building <span className="team__accent">Afriversity</span>
          </motion.h1>
          <motion.p className="team__lede" variants={riseItem}>
            {INTRO}
          </motion.p>
        </motion.section>

        <motion.ul className="team__grid" role="list" variants={staggerParent} initial="hidden" animate="show">
          {TEAM.map((m, i) => (
            <motion.li key={m.name} className="team-card" variants={riseItem} data-lead={i < 2 || undefined}>
              <span className="team-card__avatar" aria-hidden="true">
                {initials(m.name)}
              </span>
              <h2 className="team-card__name">{m.name}</h2>
              <p className="team-card__title">{m.title}</p>
            </motion.li>
          ))}
        </motion.ul>

        <section className="team__cta" aria-label="Get started">
          <p>Scholarships, courses, mentors and university applications in one place.</p>
          <ButtonLink to="/signup" size="lg" iconEnd={<ArrowRight aria-hidden="true" />}>
            Get started — it’s free
          </ButtonLink>
        </section>

        <SiteFooter />
      </div>
    </PageTransition>
  );
}
