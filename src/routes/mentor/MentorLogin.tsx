import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AuthLayout } from '../../features/auth/AuthLayout';
import { AuthForm } from '../../features/auth/AuthForm';
import { RedirectIfSignedIn } from '../../features/auth/RedirectIfSignedIn';
import { Button } from '../../components/Button/Button';

export default function MentorLogin() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const applying = mode === 'signup';

  return (
    <RedirectIfSignedIn>
      <AuthLayout
        eyebrow="Afriversity mentors"
        title={applying ? 'Apply to mentor' : 'Mentor sign-in'}
        lede={
          applying
            ? 'Share what you know with students across Africa. Every application is reviewed before your profile goes live.'
            : 'Manage your sessions and earnings.'
        }
        footer={
          <>
            <Button variant="quiet" onClick={() => setMode(applying ? 'login' : 'signup')}>
              {applying ? 'Already a mentor? Sign in' : 'New mentor? Apply here'}
            </Button>
            <Link to="/login" className="auth-quiet-link">
              Student sign-in
            </Link>
          </>
        }
      >
        <AuthForm key={mode} mode={mode} audience="mentor" />
      </AuthLayout>
    </RedirectIfSignedIn>
  );
}
