import { useEffect, useState } from 'react';
import { errorMessage } from '../../lib/supabase';
import { fetchMyResults } from './api';
import type { WassceResults } from './types';

/** The student's saved results. `undefined` while loading; an error leaves results null. */
export function useMyResults(userId: string | undefined) {
  const [results, setResults] = useState<WassceResults | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    fetchMyResults(userId)
      .then((r) => active && setResults(r))
      .catch((e) => {
        if (!active) return;
        setError(errorMessage(e));
        setResults(null);
      });
    return () => {
      active = false;
    };
  }, [userId]);

  return { results, error, setResults };
}
