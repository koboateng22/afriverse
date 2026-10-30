import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { errorMessage, getSupabase } from '../../lib/supabase';
import { homeFor, useAuth } from './useAuth';
import { FullscreenLoader } from '../../components/FullscreenLoader/FullscreenLoader';
import { PageTransition } from '../../components/PageTransition/PageTransition';
import './AuthLayout.css';

/**
 * Landing page for email-confirmation links and Google OAuth (/auth/callback).
 *
 * Supabase sends the user back here with either `?code=…` (PKCE, our client's
 * flowType) or `#access_token=…` (implicit). The client's `detectSessionInUrl`
 * turns either into a session; `getSession()` waits for that to finish, and
 * `onAuthStateChange` catches it if it lands a moment later. Once the session is
 * active (and the app's profile has loaded) we go to the right home:
 * /home for onboarded students, /onboarding for new ones, mentors/admins to theirs.
 */
export default function AuthCallback() {
  const navigate = useNavigate();
  const auth = useAuth();
  const [session, setSession] = useState<Session | null>(null);
  const [failure, setFailure] = useState<string | null>(() => {
    // Supabase reports link problems (expired, already used) in the query or hash.
    const params = new URLSearchParams(window.location.search + window.location.hash.replace('#', '&'));
    return params.get('error_description');
  });
  const gotSession = useRef(false);

  // 1. Get the session from the Supabase client.
  useEffect(() => {
    if (failure) return;
    let supabase;
    try {
      supabase = getSupabase();
    } catch (e) {
      setFailure(errorMessage(e));
      return;
    }

    let active = true;
    const accept = (s: Session | null) => {
      if (!active || !s) return;
      gotSession.current = true;
      setSession(s);
    };

    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) setFailure(error.message);
      else accept(data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => accept(s));

    // A link that never produces a session (expired / reused) shouldn't spin forever.
    const timer = window.setTimeout(() => {
      if (active && !gotSession.current) setFailure('The link may have expired or already been used.');
    }, 12000);

    return () => {
      active = false;
      sub.subscription.unsubscribe();
      window.clearTimeout(timer);
    };
  }, [failure]);

  // 2. Once the session is active and the app has loaded that user's profile, navigate.
  useEffect(() => {
    if (!session) return;
    const caughtUp = auth.session?.user.id === session.user.id && !auth.loading;
    if (!caughtUp) return;
    navigate(auth.profile ? homeFor(auth.profile) : '/home', { replace: true });
  }, [session, auth.session, auth.loading, auth.profile, navigate]);

  if (failure) {
    return (
      <PageTransition bare label="Sign-in problem">
        <div className="container auth-callback" role="alert">
          <h1>We couldn't finish signing you in</h1>
          <p>{failure}</p>
          <Link to="/login">Back to sign in</Link>
        </div>
      </PageTransition>
    );
  }
  return <FullscreenLoader label="Signing you in" />;
}
