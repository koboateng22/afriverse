import { lazy, Suspense, useEffect, useLayoutEffect, type ReactNode } from 'react';
import { AnimatePresence, MotionConfig } from 'framer-motion';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigationType } from 'react-router-dom';
import { AuthProvider } from './features/auth/AuthProvider';
import { useAuth } from './features/auth/useAuth';
import { ProtectedRoute } from './features/auth/ProtectedRoute';
import { isStudent, STUDENT_ROLES } from './features/profiles/types';
import { PlanProvider } from './features/billing/PlanProvider';
import { PaywallProvider } from './features/billing/PaywallModal';
import { Backdrop, GrainOverlay } from './components/Backdrop/Backdrop';
import { BottomNav, MENTOR_NAV, navMatches, STUDENT_NAV } from './components/BottomNav/BottomNav';
import { ErrorBoundary } from './components/ErrorBoundary/ErrorBoundary';
import { ToastProvider } from './components/Toast/Toast';
import { FullscreenLoader } from './components/FullscreenLoader/FullscreenLoader';
import Landing from './routes/Landing/Landing';

// Every route except the landing page is code-split.
// The tab destinations are also warmed on idle (below) so switching tabs never
// drops to the Suspense fallback mid-crossfade.
const loadHome = () => import('./routes/Home/Home');
const loadCourses = () => import('./routes/Courses/Courses');
const loadProfile = () => import('./routes/Profile/Profile');
const loadCompass = () => import('./routes/CareerCompass/CareerCompass');
const loadPaywall = () => import('./routes/Paywall/Paywall');
const Login = lazy(() => import('./routes/auth/Login'));
const Signup = lazy(() => import('./routes/auth/Signup'));
const ResetPassword = lazy(() => import('./routes/auth/ResetPassword'));
const UpdatePassword = lazy(() => import('./routes/auth/UpdatePassword'));
const AmbassadorApply = lazy(() => import('./routes/auth/AmbassadorApply'));
const MentorApply = lazy(() => import('./routes/mentor/MentorApply'));
const AuthCallback = lazy(() => import('./features/auth/AuthCallback'));
const Onboarding = lazy(() => import('./routes/Onboarding/Onboarding'));
const Home = lazy(loadHome);
const OpportunityDetail = lazy(() => import('./routes/OpportunityDetail/OpportunityDetail'));
const CareerCompass = lazy(loadCompass);
const Courses = lazy(loadCourses);
const CourseDetail = lazy(() => import('./routes/CourseDetail/CourseDetail'));
const Mentors = lazy(() => import('./routes/Mentors/Mentors'));
const MentorDetail = lazy(() => import('./routes/MentorDetail/MentorDetail'));
const ApplyUniversity = lazy(() => import('./routes/ApplyUniversity/ApplyUniversity'));
const UniversityDetail = lazy(() => import('./routes/UniversityDetail/UniversityDetail'));
const CompleteApplication = lazy(() => import('./routes/CompleteApplication/CompleteApplication'));
const EssayReview = lazy(() => import('./routes/EssayReview/EssayReview'));
const Applications = lazy(() => import('./routes/Applications/Applications'));
const Results = lazy(() => import('./routes/Results/Results'));
const AmbassadorHub = lazy(() => import('./routes/AmbassadorHub/AmbassadorHub'));
const Profile = lazy(loadProfile);
const Paywall = lazy(loadPaywall);
const Checkout = lazy(() => import('./routes/Checkout/Checkout'));
const Scratch = lazy(() => import('./routes/Scratch/Scratch'));
const NotFound = lazy(() => import('./routes/NotFound/NotFound'));
const MentorLogin = lazy(() => import('./routes/mentor/MentorLogin'));
const MentorDashboard = lazy(() => import('./routes/mentor/MentorDashboard'));
const MentorSessions = lazy(() => import('./routes/mentor/MentorSessions'));
const MentorEarnings = lazy(() => import('./routes/mentor/MentorEarnings'));
const AdminLayout = lazy(() => import('./routes/admin/AdminLayout'));

const student = (el: ReactNode) => <ProtectedRoute roles={STUDENT_ROLES}>{el}</ProtectedRoute>;
const mentor = (el: ReactNode) => (
  <ProtectedRoute roles={['mentor']} loginPath="/mentor/login">
    {el}
  </ProtectedRoute>
);

/** Warm the main tab chunks once the browser is idle. */
function usePrefetchTabs(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const run = () => void Promise.all([loadHome(), loadCourses(), loadProfile(), loadCompass(), loadPaywall()]).catch(() => undefined);
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number; cancelIdleCallback?: (id: number) => void };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(run);
      return () => w.cancelIdleCallback?.(id);
    }
    const t = window.setTimeout(run, 1200);
    return () => window.clearTimeout(t);
  }, [enabled]);
}

function AnimatedRoutes() {
  const location = useLocation();
  const navType = useNavigationType();
  const { profile } = useAuth();
  const path = location.pathname;
  const showStudentNav = isStudent(profile?.role) && Boolean(profile.onboarded_at) && navMatches(STUDENT_NAV, path) && !path.startsWith('/checkout');
  const showMentorNav = profile?.role === 'mentor' && navMatches(MENTOR_NAV, path);
  const heroBackdrop = path === '/' || path === '/signup' || path === '/ambassador-apply' || path === '/mentor-apply';
  // The admin console animates its own sub-pages, so the whole group shares one key.
  const routeKey = path.startsWith('/admin') ? '/admin' : path;
  usePrefetchTabs(isStudent(profile?.role));

  // New screens start at the top (back/forward keeps the browser's position).
  // Runs before paint; the leaving screen has already pinned its own offset.
  useLayoutEffect(() => {
    if (navType !== 'POP') window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [routeKey, navType]);

  return (
    <>
      <Backdrop tone={path === '/paywall' ? 'vip' : heroBackdrop ? 'hero' : 'quiet'} />
      {/* "sync": old and new screens overlap → a real crossfade, not fade-out-then-in.
          Each route gets its OWN keyed Suspense boundary inside AnimatePresence: a lazy
          route suspending (React.lazy suspends on first render even when the chunk is
          cached) then only affects the incoming screen. With one shared boundary outside,
          the suspension would hide the leaving screen too and cut its exit animation off. */}
      <AnimatePresence mode="sync" initial={false}>
        <Suspense key={routeKey} fallback={<FullscreenLoader label="Loading" />}>
          <Routes location={location}>
            {/* ── Public ─────────────────────────────────────────── */}
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/update-password" element={<UpdatePassword />} />
            <Route path="/ambassador-apply" element={<AmbassadorApply />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/scratch" element={<Scratch />} />

            {/* ── Student ────────────────────────────────────────── */}
            <Route
              path="/onboarding"
              element={
                <ProtectedRoute roles={STUDENT_ROLES} requireOnboarded={false}>
                  <Onboarding />
                </ProtectedRoute>
              }
            />
            <Route path="/home" element={student(<Home />)} />
            <Route path="/opportunity/:id" element={student(<OpportunityDetail />)} />
            <Route path="/career-compass" element={student(<CareerCompass />)} />
            <Route path="/courses" element={student(<Courses />)} />
            <Route path="/courses/:id" element={student(<CourseDetail />)} />
            <Route path="/mentors" element={student(<Mentors />)} />
            <Route path="/mentors/:id" element={student(<MentorDetail />)} />
            <Route path="/apply" element={<Navigate to="/apply-university" replace />} />
            <Route path="/apply-university" element={student(<ApplyUniversity />)} />
            <Route path="/apply-university/:id" element={student(<UniversityDetail />)} />
            <Route path="/applications" element={student(<Applications />)} />
            <Route path="/applications/:id/complete" element={student(<CompleteApplication />)} />
            <Route path="/essay-review" element={student(<EssayReview />)} />
            <Route path="/results" element={student(<Results />)} />
            <Route path="/ambassador" element={student(<AmbassadorHub />)} />
            <Route path="/profile" element={student(<Profile />)} />
            <Route path="/paywall" element={student(<Paywall />)} />
            <Route path="/checkout" element={student(<Checkout />)} />

            {/* ── Mentor (entry: quiet link on /login only) ──────── */}
            <Route path="/mentor/login" element={<MentorLogin />} />
            <Route path="/mentor-apply" element={<MentorApply />} />
            <Route path="/mentor" element={<Navigate to="/mentor/dashboard" replace />} />
            <Route path="/mentor/dashboard" element={mentor(<MentorDashboard />)} />
            <Route path="/mentor/sessions" element={mentor(<MentorSessions />)} />
            <Route path="/mentor/earnings" element={mentor(<MentorEarnings />)} />

            {/* ── Admin: separate group, never linked. Anyone else → "/" ── */}
            <Route
              path="/admin/*"
              element={
                <ProtectedRoute roles={['admin']} loginPath="/" denyPath="/">
                  <ErrorBoundary label="Admin console">
                    <AdminLayout />
                  </ErrorBoundary>
                </ProtectedRoute>
              }
            />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </AnimatePresence>
      {showStudentNav && <BottomNav items={STUDENT_NAV} />}
      {showMentorNav && <BottomNav items={MENTOR_NAV} />}
    </>
  );
}

export function App() {
  return (
    // reducedMotion="user": Framer drops transform/layout animations when the OS asks.
    <MotionConfig reducedMotion="user">
      <BrowserRouter>
        <AuthProvider>
          <PlanProvider>
            <PaywallProvider>
              <ToastProvider>
                <AnimatedRoutes />
                <GrainOverlay />
              </ToastProvider>
            </PaywallProvider>
          </PlanProvider>
        </AuthProvider>
      </BrowserRouter>
    </MotionConfig>
  );
}
