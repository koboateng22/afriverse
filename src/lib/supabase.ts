import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Only the public anon key + URL ever reach the browser.
 * Row Level Security is what actually protects data.
 */
export class ConfigError extends Error {
  missing: string[];
  constructor(missing: string[]) {
    super(`Afriversity is missing required environment variables: ${missing.join(', ')}. Copy .env.example to .env and fill them in.`);
    this.name = 'ConfigError';
    this.missing = missing;
  }
}

let client: SupabaseClient | null = null;

/** Returns the shared client or throws ConfigError — never a fake/dummy client. */
export function getSupabase(): SupabaseClient {
  if (client) return client;
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  const missing = [!url && 'VITE_SUPABASE_URL', !anonKey && 'VITE_SUPABASE_ANON_KEY'].filter(Boolean) as string[];
  if (missing.length) throw new ConfigError(missing);

  client = createClient(url as string, anonKey as string, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
  });
  return client;
}

/** Normalises Supabase / unknown errors into a user-facing sentence. */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return 'Something went wrong. Please try again.';
}
