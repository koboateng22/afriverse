import { Link } from 'react-router-dom';
import { AuthLayout } from '../../features/auth/AuthLayout';
import { AuthForm } from '../../features/auth/AuthForm';
import { RedirectIfSignedIn } from '../../features/auth/RedirectIfSignedIn';

export default function Signup() {
  return (
    <RedirectIfSignedIn>
      <AuthLayout
        eyebrow="Free to join"
        title="Your next opportunity starts here"
        lede="Scholarships matched to you, short courses, mentors and university applications — in one place."
        footer={
          <p>
            Already have an account? <Link to="/login">Sign in</Link>
          </p>
        }
      >
        <AuthForm mode="signup" audience="student" />
      </AuthLayout>
    </RedirectIfSignedIn>
  );
}
