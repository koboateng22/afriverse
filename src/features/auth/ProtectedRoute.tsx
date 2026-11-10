import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { isStudent, type Role } from '../profiles/types';
import { homeFor, useAuth } from './useAuth';
import { ConfigErrorScreen } from '../../components/ConfigErrorScreen/ConfigErrorScreen';
import { FullscreenLoader } from '../../components/FullscreenLoader/FullscreenLoader';

export type ProtectedRouteProps = {
  roles: Role[];
  /** Where to send signed-out visitors. */
  loginPath?: string;
  /** Where to send signed-in users with the wrong role. Defaults to their own home. */
  denyPath?: string;
  /** Students only: require onboarding to be finished (default true). */
  requireOnboarded?: boolean;
  children: ReactNode;
};

/**
 * Client-side gate for UX only. Real enforcement is RLS + column grants in
 * Postgres and service-role checks in edge functions.
 */
export function ProtectedRoute({ roles, loginPath = '/login', denyPath, requireOnboarded = true, children }: ProtectedRouteProps) {
  const { loading, session, profile, configError } = useAuth();
  const location = useLocation();

  if (configError) return <ConfigErrorScreen error={configError} />;
  if (loading) return <FullscreenLoader label="Checking your session" />;
  if (!session) return <Navigate to={loginPath} replace state={{ from: location.pathname }} />;
  // Signed in but the profile row could not be read: fail closed.
  if (!profile) return <Navigate to={denyPath ?? '/'} replace />;

  if (!roles.includes(profile.role)) return <Navigate to={denyPath ?? homeFor(profile)} replace />;

  if (isStudent(profile.role) && requireOnboarded && !profile.onboarded_at) {
    return <Navigate to="/onboarding" replace />;
  }
  return <>{children}</>;
}
