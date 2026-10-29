import { Link, useLocation } from 'react-router-dom';
import { motion, type Variants } from 'framer-motion';
import { CalendarDays, Compass, GraduationCap, LayoutDashboard, UserRound, Wallet, type LucideIcon } from 'lucide-react';
import { spring } from '../../lib/motion';
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
  { to: '/profile', label: 'You', icon: UserRound, match: ['/profile', '/applications', '/apply-university', '/paywall'] },
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

export function BottomNav({ items, id }: { items: NavItem[]; id: string }) {
  const { pathname } = useLocation();
  const activeIndex = items.findIndex((i) => i.match.some((m) => pathname.startsWith(m)));

  return (
    <nav className="bottom-nav" aria-label="Primary">
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
                {active && <motion.span className="bottom-nav__pill" layoutId={`${id}-nav-pill`} transition={spring} aria-hidden="true" />}
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
    </nav>
  );
}
