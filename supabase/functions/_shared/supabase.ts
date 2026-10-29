import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2';
import { requireEnv } from './env.ts';
import { HttpError } from './http.ts';

/** Service-role client: bypasses RLS. Only ever used inside edge functions. */
export function serviceClient(): SupabaseClient {
  return createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Client that acts as the calling user, so RLS still applies. */
export function userClient(jwt: string): SupabaseClient {
  return createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_ANON_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
}

export type Caller = { user: User; jwt: string; role: 'student' | 'mentor' | 'admin' };

/**
 * Verifies the Supabase JWT on the request with the Auth server (not just by
 * decoding it) and loads the caller's role from public.profiles.
 */
export async function requireUser(req: Request, svc: SupabaseClient): Promise<Caller> {
  const header = req.headers.get('Authorization') ?? '';
  const jwt = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!jwt) throw new HttpError(401, 'unauthorized', 'Missing bearer token');

  const { data, error } = await svc.auth.getUser(jwt);
  if (error || !data.user) throw new HttpError(401, 'unauthorized', 'Invalid or expired session');

  const { data: profile, error: pErr } = await svc.from('profiles').select('role').eq('id', data.user.id).maybeSingle();
  if (pErr) throw pErr;
  if (!profile) throw new HttpError(403, 'no_profile', 'No profile exists for this account');

  return { user: data.user, jwt, role: profile.role as Caller['role'] };
}
