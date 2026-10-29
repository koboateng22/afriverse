import { useContext } from 'react';
import { AuthContext, type AuthState } from './AuthProvider';
import type { Profile, Role } from '../profiles/types';

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** Where a signed-in user belongs by default. */
export function homeFor(profile: Profile | null): string {
  if (!profile) return '/login';
  const byRole: Record<Role, string> = {
    admin: '/admin',
    mentor: '/mentor/dashboard',
    student: profile.onboarded_at ? '/home' : '/onboarding',
  };
  return byRole[profile.role];
}
