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
            {/* Quiet mentor entry point — never shown in student navigation. */}
            <Link to="/mentor/login" className="auth-quiet-link">
              Mentor sign-in
            </Link>
          </>
        }
      >
        <AuthForm mode="login" audience="student" />
      </AuthLayout>
    </RedirectIfSignedIn>
  );
}
