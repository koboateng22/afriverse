import { PageTransition } from '../../components/PageTransition/PageTransition';
import { PageHeader } from '../../components/PageHeader/PageHeader';
import { Skeleton } from '../../components/Skeleton/Skeleton';
import { useAuth } from '../../features/auth/useAuth';
import { ResultCalculator } from '../../features/results/ResultCalculator';
import { useMyResults } from '../../features/results/useMyResults';
import './Results.css';

export default function Results() {
  const { profile } = useAuth();
  const userId = profile?.id;
  const { results } = useMyResults(userId);

  return (
    <PageTransition label="WASSCE Result Calculator">
      <div className="container results-page">
        <PageHeader
          back={{ to: '/profile', label: 'You' }}
          eyebrow="WASSCE"
          title="Result Calculator"
          lede="Work out your aggregate and save it to your profile. Type your grades in, or scan your result slip and we’ll fill them in."
        />
        {/* ProtectedRoute guarantees a profile; wait for the saved results before mounting the form. */}
        {!userId || results === undefined ? (
          <Skeleton shape="block" height="320px" label="Loading your results" />
        ) : (
          <ResultCalculator userId={userId} initial={results} />
        )}
      </div>
    </PageTransition>
  );
}
