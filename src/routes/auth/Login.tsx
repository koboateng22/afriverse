import { Link } from 'react-router-dom';
import { AuthLayout } from '../../features/auth/AuthLayout';
import { AuthForm } from '../../features/auth/AuthForm';
import { RedirectIfSignedIn } from '../../features/auth/RedirectIfSignedIn';

export default function Login() {
  return (
    <RedirectIfSignedIn>
      <AuthLayout
        eyebrow="Welcome back"
        title="Sign in to Afriversity"
        footer={
          <>
            <p>
              New here? <Link to="/signup">Create an account</Link>
            </p>
            {/* Quiet entry points — never shown in student navigation. */}
            <span className="auth-quiet-links">
              <Link to="/mentor/login" className="auth-quiet-link">
                Mentor sign-in
              </Link>
              <Link to="/ambassador-apply" className="auth-quiet-link">
                Apply to be a Campus Ambassador
              </Link>
            </span>
          </>
        }
      >
        <AuthForm mode="login" audience="student" />
      </AuthLayout>
    </RedirectIfSignedIn>
  );
}
