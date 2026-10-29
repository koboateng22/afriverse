import { useCallback, useEffect, useState } from 'react';
import { errorMessage } from '../../lib/supabase';
import { adminCall } from './api';

/** Loads one admin-api list action and exposes reload + a guarded mutate helper. */
export function useAdminData<T>(action: string, payload: Record<string, unknown> = {}) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = JSON.stringify(payload);

  const reload = useCallback(() => {
    setError(null);
    adminCall<T>(action, JSON.parse(key) as Record<string, unknown>)
      .then(setData)
      .catch((e) => setError(errorMessage(e)));
  }, [action, key]);

  useEffect(reload, [reload]);

  /** Runs a write; reloads on success; returns an error message or null. */
  const mutate = useCallback(
    async (writeAction: string, writePayload: Record<string, unknown>): Promise<string | null> => {
      try {
        await adminCall(writeAction, writePayload);
        reload();
        return null;
      } catch (e) {
        return errorMessage(e);
      }
    },
    [reload],
  );

  return { data, error, reload, mutate };
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}
