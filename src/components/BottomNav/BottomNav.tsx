import { Link, useLocation } from 'react-router-dom';
import { motion, type Variants } from 'framer-motion';
import { Building2, CalendarDays, Compass, FileText, GraduationCap, LayoutDashboard, MessageCircle, PenLine, Sparkles, UserRound, Users, Wallet, type LucideIcon } from 'lucide-react';
import { useAuth } from '../../features/auth/useAuth';
import { usePlan } from '../../features/billing/PlanProvider';
import { Logo } from '../Logo/Logo';
import './BottomNav.css';

type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Route prefixes that keep this tab highlighted. */
  match: string[];
};

// Exactly three items per surface (acceptance check). Admin links never appear in either.
export const STUDENT_NAV: NavItem[] = [
  { to: '/home', label: 'Discover', icon: Compass, match: ['/home', '/opportunity'] },
  { to: '/courses', label: 'Learn', icon: GraduationCap, match: ['/courses', '/career-compass', '/mentors', '/essay-review'] },
  { to: '/profile', label: 'You', icon: UserRound, match: ['/profile', '/applications', '/apply-university', '/paywall', '/results', '/ambassador'] },
];

export type NavSection = { title?: string; items: NavItem[] };

/**
 * Desktop sidebar (768px and up): the same destinations as the phone tabs, but
 * spelled out, so nothing hides behind "You" on a big screen.
 */
export const STUDENT_SECTIONS: NavSection[] = [
  {
    items: [
      { to: '/home', label: 'Discover', icon: Compass, match: ['/home', '/opportunity'] },
      { to: '/apply-university', label: 'Universities', icon: Building2, match: ['/apply-university'] },
      { to: '/applications', label: 'My applications', icon: FileText, match: ['/applications'] },
    ],
  },
  {
    title: 'Learn',
    items: [
      { to: '/courses', label: 'Courses', icon: GraduationCap, match: ['/courses'] },
      { to: '/career-compass', label: 'AI Counsellor', icon: MessageCircle, match: ['/career-compass'] },
      { to: '/essay-review', label: 'Essay Reviewer', icon: PenLine, match: ['/essay-review'] },
      { to: '/mentors', label: 'Mentors', icon: Users, match: ['/mentors'] },
    ],
  },
  {
    title: 'Account',
    items: [
      { to: '/profile', label: 'Profile', icon: UserRound, match: ['/profile', '/results', '/ambassador'] },
      { to: '/paywall', label: 'Afriversity Pro', icon: Sparkles, match: ['/paywall'] },
    ],
  },
];

export const MENTOR_NAV: NavItem[] = [
  { to: '/mentor/dashboard', label: 'Dashboard', icon: LayoutDashboard, match: ['/mentor/dashboard'] },
  { to: '/mentor/sessions', label: 'Sessions', icon: CalendarDays, match: ['/mentor/sessions'] },
  { to: '/mentor/earnings', label: 'Earnings', icon: Wallet, match: ['/mentor/earnings'] },
];

// Plain Link (not NavLink): NavLink only honours aria-current when its own URL
// matches, so on sub-routes (/career-compass under "Learn") the active tab lost
// aria-current — and with it the active label colour. We compute `active` from
// each tab's prefix list and set aria-current ourselves.
const MotionNavLink = motion.create(Link);

/** Low damping = visible overshoot: the icon bounces like a physical button. */
const bouncy = { type: 'spring', stiffness: 620, damping: 11, mass: 0.7 } as const;

// Variants propagate from the link to the icon, so pressing anywhere on the
// tab (not just the glyph) squashes the icon.
const iconVariants: Variants = {
  idle: { scale: 1, y: 0, transition: bouncy },
  active: { scale: 1, y: -1, transition: bouncy },
  hover: { scale: 1.1, y: -2, transition: bouncy },
  tap: { scale: 0.72, y: 2, transition: { type: 'spring', stiffness: 900, damping: 30 } },
};

export function navMatches(items: NavItem[], pathname: string): boolean {
  return items.some((i) => i.match.some((m) => pathname.startsWith(m)));
}

const initialsOf = (name: string | null | undefined, fallback: string) =>
  (name || fallback).split(/[\s@]/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');

/** Desktop sidebar: grouped links, then who's signed in. Hidden on phones (BottomNav.css). */
function SideNav({ sections }: { sections: NavSection[] }) {
  const { pathname } = useLocation();
  const { profile, session } = useAuth();
  const { isPro } = usePlan();
  return (
    <div className="side-nav">
      {sections.map((section, si) => (
        <div key={section.title ?? si} className="side-nav__section">
          {section.title && <p className="side-nav__title">{section.title}</p>}
          <ul className="side-nav__list" role="list">
            {section.items.map((item) => {
              const Icon = item.icon;
              const active = item.match.some((m) => pathname.startsWith(m));
              return (
                <li key={item.to}>
                  <Link to={item.to} className="side-nav__link" aria-current={active ? 'page' : undefined} title={item.label}>
                    <Icon className="side-nav__icon" aria-hidden="true" />
                    <span className="side-nav__label">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <Link to="/profile" className="side-nav__me" title={profile?.full_name ?? 'Your profile'}>
        <span className="side-nav__avatar" aria-hidden="true">{initialsOf(profile?.full_name, session?.user.email ?? '?')}</span>
        <span className="side-nav__who">
          <span className="side-nav__name">{profile?.full_name || 'Your profile'}</span>
          <span className="side-nav__plan" data-pro={isPro || undefined}>{isPro ? 'Pro member' : 'Free plan'}</span>
        </span>
      </Link>
    </div>
  );
}

/**
 * Bottom bar on phones (exactly the three `items`). From 768px it becomes a
 * left sidebar: `sections` when given (students), otherwise the same items.
 */
export function BottomNav({ items, sections }: { items: NavItem[]; sections?: NavSection[] }) {
  const { pathname } = useLocation();
  const activeIndex = items.findIndex((i) => i.match.some((m) => pathname.startsWith(m)));

  return (
    <nav className="bottom-nav" aria-label="Primary">
      <div className="bottom-nav__brand">
        <Logo to={items[0].to} />
      </div>
      <ul className="bottom-nav__list" role="list">
        {items.map((item, i) => {
          const Icon = item.icon;
          const active = i === activeIndex;
          return (
            <li key={item.to} className="bottom-nav__item">
              <MotionNavLink
                to={item.to}
                className="bottom-nav__link"
                aria-current={active ? 'page' : undefined}
                initial={false}
                animate={active ? 'active' : 'idle'}
                whileHover="hover"
                whileTap="tap"
              >
                {active && <span className="bottom-nav__pill" aria-hidden="true" />}
                {/* Outer span follows the link's variants (hover / tap / active).
                    Inner span is remounted on activation and runs its own pop-in
                    (squashed → overshoot → settle); transforms of the two compose. */}
                <motion.span className="bottom-nav__icon-wrap" variants={iconVariants} aria-hidden="true">
                  <motion.span
                    key={active ? 'on' : 'off'}
                    className="bottom-nav__icon-pop"
                    initial={active ? { scale: 0.55, y: 6 } : { scale: 1, y: 0 }}
                    animate={{ scale: 1, y: 0 }}
                    transition={bouncy}
                  >
                    <Icon className="bottom-nav__icon" />
                  </motion.span>
                </motion.span>
                <span className="bottom-nav__label">{item.label}</span>
              </MotionNavLink>
            </li>
          );
        })}
      </ul>
      {sections && <SideNav sections={sections} />}
    </nav>
  );
}
