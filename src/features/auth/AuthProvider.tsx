import { createContext, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ConfigError, getSupabase } from '../../lib/supabase';
import { fetchProfile } from '../profiles/api';
import type { Profile } from '../profiles/types';

export type AuthState = {
  /** True until the stored session (and its profile) has been resolved. */
  loading: boolean;
  session: Session | null;
  /** Role always comes from public.profiles — never from user_metadata. */
  profile: Profile | null;
  configError: ConfigError | null;
  refreshProfile: () => Promise<Profile | null>;
  setProfile: (p: Profile) => void;
  signOut: () => Promise<void>;
};

export const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [configError, setConfigError] = useState<ConfigError | null>(null);
  const loadedFor = useRef<string | null>(null);

  const loadProfile = useCallback(async (s: Session | null) => {
    if (!s) {
      loadedFor.current = null;
      setProfile(null);
      return null;
    }
    try {
      const p = await fetchProfile(s.user.id);
      loadedFor.current = p ? s.user.id : null;
      setProfile(p);
      return p;
    } catch {
      loadedFor.current = null;
      setProfile(null);
      return null;
    }
  }, []);

  useEffect(() => {
    let supabase;
    try {
      supabase = getSupabase();
    } catch (err) {
      if (err instanceof ConfigError) setConfigError(err);
      setLoading(false);
      return;
    }

    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      await loadProfile(data.session);
      if (active) setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      if (!active) return;
      setSession(next);
      if (event === 'SIGNED_OUT') {
        setProfile(null);
        return;
      }
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        // SIGNED_IN also fires when a tab regains focus; only block the UI
        // when the user actually changed.
        if (next && loadedFor.current === next.user.id && event === 'SIGNED_IN') return;
        // Defer: Supabase recommends not awaiting other calls inside this callback.
        setLoading(true);
        window.setTimeout(() => {
          loadProfile(next).finally(() => active && setLoading(false));
        }, 0);
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const refreshProfile = useCallback(() => loadProfile(session), [loadProfile, session]);

  const signOut = useCallback(async () => {
    await getSupabase().auth.signOut();
    setProfile(null);
    setSession(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({ loading, session, profile, configError, refreshProfile, setProfile, signOut }),
    [loading, session, profile, configError, refreshProfile, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
