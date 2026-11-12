import { Link } from 'react-router-dom';
import { AuthLayout } from '../../features/auth/AuthLayout';
import { AuthForm } from '../../features/auth/AuthForm';
import { RedirectIfSignedIn } from '../../features/auth/RedirectIfSignedIn';

/** /mentor/login — mentors sign in here; new mentors apply at /mentor-apply. */
export default function MentorLogin() {
  return (
    <RedirectIfSignedIn>
      <AuthLayout
        eyebrow="Afriversity mentors"
        title="Mentor sign-in"
        lede="Manage your sessions and earnings."
        footer={
          <>
            <p>
              New mentor? <Link to="/mentor-apply">Apply as a Mentor</Link>
            </p>
            <Link to="/login" className="auth-quiet-link">
              Student sign-in
            </Link>
          </>
        }
      >
        <AuthForm mode="login" audience="mentor" />
      </AuthLayout>
    </RedirectIfSignedIn>
  );
}
