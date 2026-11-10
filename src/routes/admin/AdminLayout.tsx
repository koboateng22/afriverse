import { lazy, Suspense } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { LogOut } from 'lucide-react';
import { PageTransition } from '../../components/PageTransition/PageTransition';
import { ErrorBoundary } from '../../components/ErrorBoundary/ErrorBoundary';
import { Logo } from '../../components/Logo/Logo';
import { Button } from '../../components/Button/Button';
import { Skeleton } from '../../components/Skeleton/Skeleton';
import { useAuth } from '../../features/auth/useAuth';
import './AdminConsole.css';

const AdminOverview = lazy(() => import('./AdminOverview'));
const AdminUniversities = lazy(() => import('./AdminUniversities'));
const AdminOpportunities = lazy(() => import('./AdminOpportunities'));
const AdminCourses = lazy(() => import('./AdminCourses'));
const AdminMentors = lazy(() => import('./AdminMentors'));
const AdminAmbassadors = lazy(() => import('./AdminAmbassadors'));
const AdminApplications = lazy(() => import('./AdminApplications'));
const AdminPlans = lazy(() => import('./AdminPlans'));
const AdminSettings = lazy(() => import('./AdminSettings'));

const TABS = [
  { to: '/admin', label: 'Overview', end: true },
  { to: '/admin/universities', label: 'Universities' },
  { to: '/admin/opportunities', label: 'Opportunities' },
  { to: '/admin/courses', label: 'Courses' },
  { to: '/admin/mentors', label: 'Mentors' },
  { to: '/admin/ambassadors', label: 'Ambassadors' },
  { to: '/admin/applications', label: 'Applications' },
  { to: '/admin/plans', label: 'Pro plan' },
  { to: '/admin/settings', label: 'Settings' },
];

/** Separate route group. Nothing in the student or mentor apps links here. */
export default function AdminLayout() {
  const { session, profile, signOut } = useAuth();
  const location = useLocation();

  if (profile?.role !== 'admin') return <Navigate to="/" replace />;

  return (
    <PageTransition bare label="Admin console">
      <div className="container admin" data-wide>
        <header className="admin__bar">
          <Logo to="/admin" />
          <span className="admin__who">{session?.user.email}</span>
          <Button variant="quiet" size="sm" icon={<LogOut aria-hidden="true" />} onClick={signOut}>
            Sign out
          </Button>
        </header>

        <nav className="admin__tabs" aria-label="Admin sections">
          {TABS.map((t) => (
            <NavLink key={t.to} to={t.to} end={t.end} className="admin__tab">
              {({ isActive }) => (
                <>
                  {isActive && <span className="admin__tab-pill" />}
                  <span className="admin__tab-label">{t.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* A crash in one section keeps the bar and tabs usable; changing tab clears it. */}
        <ErrorBoundary label="This admin section" resetKey={location.pathname}>
          <Suspense fallback={<Skeleton shape="block" height="240px" label="Loading section" />}>
            <AnimatePresence mode="wait">
              <motion.div key={location.pathname} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                <Routes location={location}>
                  <Route index element={<AdminOverview />} />
                  <Route path="universities" element={<AdminUniversities />} />
                  <Route path="opportunities" element={<AdminOpportunities />} />
                  <Route path="courses" element={<AdminCourses />} />
                  <Route path="mentors" element={<AdminMentors />} />
                  <Route path="ambassadors" element={<AdminAmbassadors />} />
                  <Route path="applications" element={<AdminApplications />} />
                  <Route path="plans" element={<AdminPlans />} />
                  <Route path="settings" element={<AdminSettings />} />
                  <Route path="*" element={<Navigate to="/admin" replace />} />
                </Routes>
              </motion.div>
            </AnimatePresence>
          </Suspense>
        </ErrorBoundary>
      </div>
    </PageTransition>
  );
}
