import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { homeFor, useAuth } from './useAuth';
import { isStudent } from '../profiles/types';
import { FullscreenLoader } from '../../components/FullscreenLoader/FullscreenLoader';
import { ConfigErrorScreen } from '../../components/ConfigErrorScreen/ConfigErrorScreen';

/** Auth pages: once a session + profile exist, send the user where they belong. */
export function RedirectIfSignedIn({ children }: { children: ReactNode }) {
  const { loading, session, profile, configError } = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;

  if (configError) return <ConfigErrorScreen error={configError} />;
  if (loading) return <FullscreenLoader label="Checking your session" />;
  if (session && profile) {
    const home = homeFor(profile);
    // Only honour `from` when it is inside the user's own area.
    const target = from && isStudent(profile.role) && profile.onboarded_at && !from.startsWith('/admin') && !from.startsWith('/mentor') ? from : home;
    return <Navigate to={target} replace />;
  }
  return <>{children}</>;
}
