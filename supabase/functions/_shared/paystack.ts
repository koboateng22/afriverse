// INTEGRATION: paystack — every call here is a real HTTP request to api.paystack.co.
import { optionalEnv, requireEnv } from './env.ts';
import { HttpError } from './http.ts';

const PAYSTACK_API = 'https://api.paystack.co';

/**
 * Base URL for Paystack calls. PAYSTACK_API_BASE exists only so CI can point a
 * TEST key at a local Paystack-compatible server; it is ignored for live keys,
 * so production traffic can never be redirected.
 */
function apiBase(key: string): string {
  const override = optionalEnv('PAYSTACK_API_BASE');
  if (override && key.startsWith('sk_test_')) return override.replace(/\/$/, '');
  return PAYSTACK_API;
}

/** The secret key; throws a loud 500 when it isn't configured. Never a fake success. */
export function paystackSecret(): string {
  const key = requireEnv('PAYSTACK_SECRET_KEY');
  if (!/^sk_(test|live)_/.test(key)) {
    throw new HttpError(500, 'not_configured', 'PAYSTACK_SECRET_KEY does not look like a Paystack secret key (sk_test_… or sk_live_…)');
  }
  return key;
}

type PaystackEnvelope<T> = { status: boolean; message: string; data: T };

export async function paystackRequest<T>(path: string, init: { method: 'GET' | 'POST'; body?: unknown }): Promise<T> {
  const key = paystackSecret();
  let res: Response;
  try {
    res = await fetch(`${apiBase(key)}${path}`, {
      method: init.method,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
  } catch (e) {
    throw new HttpError(502, 'paystack_unreachable', `Could not reach Paystack: ${e instanceof Error ? e.message : String(e)}`);
  }
  let payload: PaystackEnvelope<T> | null = null;
  try {
    payload = (await res.json()) as PaystackEnvelope<T>;
  } catch {
    /* fall through */
  }
  if (!res.ok || !payload?.status) {
    throw new HttpError(502, 'paystack_error', `Paystack rejected the request: ${payload?.message ?? res.statusText}`, { paystack_status: res.status });
  }
  return payload.data;
}

export type PaystackTransaction = {
  id: number;
  reference: string;
  status: 'success' | 'failed' | 'abandoned' | 'ongoing' | 'pending' | 'processing' | 'queued' | 'reversed';
  amount: number;
  currency: string;
  channel: string | null;
  paid_at: string | null;
  gateway_response?: string | null;
  metadata: Record<string, unknown> | string | null;
  customer?: { customer_code?: string; email?: string } | null;
  /** Present on charges that belong to a Paystack plan (first charge + renewals). */
  plan?: string | { plan_code?: string } | null;
};

export function planCodeOf(tx: Pick<PaystackTransaction, 'plan'>): string | null {
  if (!tx.plan) return null;
  if (typeof tx.plan === 'string') return tx.plan || null;
  return tx.plan.plan_code ?? null;
}

const hex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');

/** HMAC-SHA512 of the raw body with the secret key, compared in constant time. */
export async function verifyPaystackSignature(rawBody: string, signature: string | null): Promise<boolean> {
  if (!signature) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(paystackSecret()), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
  const expected = hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody)));
  const given = signature.trim().toLowerCase();
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

/** Paystack sometimes returns metadata as a JSON string. */
export function metadataOf(tx: Pick<PaystackTransaction, 'metadata'>): Record<string, unknown> {
  if (!tx.metadata) return {};
  if (typeof tx.metadata === 'string') {
    try {
      const parsed = JSON.parse(tx.metadata);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  return tx.metadata;
}
