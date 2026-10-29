import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { homeFor, useAuth } from '../../features/auth/useAuth';
import { FullscreenLoader } from '../../components/FullscreenLoader/FullscreenLoader';
import { PageTransition } from '../../components/PageTransition/PageTransition';
import '../../features/auth/AuthLayout.css';

/** Landing point for Google OAuth + email confirmation links. */
export default function AuthCallback() {
  const { loading, session, profile } = useAuth();
  const [timedOut, setTimedOut] = useState(false);
  const params = new URLSearchParams(window.location.search + window.location.hash.replace('#', '&'));
  const providerError = params.get('error_description');

  useEffect(() => {
    const t = window.setTimeout(() => setTimedOut(true), 12000);
    return () => window.clearTimeout(t);
  }, []);

  if (session && profile) return <Navigate to={homeFor(profile)} replace />;

  if (providerError || (timedOut && !loading)) {
    return (
      <PageTransition bare label="Sign-in problem">
        <div className="container auth-callback" role="alert">
          <h1>We couldn't finish signing you in</h1>
          <p>{providerError ?? 'The sign-in link may have expired or already been used.'}</p>
          <Link to="/login">Back to sign in</Link>
        </div>
      </PageTransition>
    );
  }
  return <FullscreenLoader label="Signing you in" />;
}
