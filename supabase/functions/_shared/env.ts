import { HttpError } from './http.ts';

/**
 * Reads a required secret. Missing configuration is a loud 500 — the app
 * never pretends an integration worked when it isn't set up.
 */
export function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value || !value.trim()) {
    console.error(`Missing required secret: ${name}`);
    throw new HttpError(500, 'not_configured', `${name} is not configured on the server. Set it with: supabase secrets set ${name}=...`);
  }
  return value.trim();
}

export function optionalEnv(name: string): string | null {
  const value = Deno.env.get(name);
  return value && value.trim() ? value.trim() : null;
}
