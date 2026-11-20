import { useSyncExternalStore } from 'react';

// While held, <RedirectIfSignedIn> keeps showing the auth page even though a session exists.
// Sign-up needs this: the 6-digit code signs the user in, and the password they chose is saved
// right after. Without the hold the page would redirect (and unmount) before that finished.
let holds = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Holds the signed-in redirect until the returned release() is called (safe to call twice). */
export function holdSignedInRedirect(): () => void {
  holds += 1;
  emit();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds -= 1;
    emit();
  };
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export function useSignedInRedirectHeld(): boolean {
  return useSyncExternalStore(subscribe, () => holds > 0);
}
