// INTEGRATION: paystack — client side. The browser never sends an amount:
// it says WHAT is being bought; paystack-init prices it from the database
// (always GHS) and returns Paystack's hosted checkout URL.
import { invokeFunction } from '../../lib/functions';

export type CheckoutRequest =
  /** card = monthly auto-renew (Paystack plan); momo = one month, renew manually. */
  | { type: 'subscription'; method: 'card' | 'momo' }
  | { type: 'application'; university_id: string }
  | { type: 'mentor'; mentor_id: string; scheduled_at: string; topic?: string };

type InitResponse = { authorization_url: string; reference: string };

/** Full-page redirect (not a popup): MoMo approval prompts fail inside iframes. */
export function redirectToCheckout({ authorizationUrl }: { authorizationUrl: string }): void {
  window.location.href = authorizationUrl;
}

export async function startCheckout(req: CheckoutRequest): Promise<void> {
  const { authorization_url } = await invokeFunction<InitResponse>('paystack-init', req);
  if (!/^https?:\/\//.test(authorization_url ?? '')) throw new Error('Paystack did not return a checkout link.');
  redirectToCheckout({ authorizationUrl: authorization_url });
}

export type VerifyResponse = {
  status: 'pending' | 'success' | 'failed';
  kind: 'subscription' | 'application' | 'mentor';
  related_id: string | null;
  failure_reason: string | null;
  amount_cents: number;
  currency: string;
  metadata: Record<string, unknown>;
};

export function verifyPayment(reference: string): Promise<VerifyResponse> {
  return invokeFunction<VerifyResponse>('paystack-verify', { reference });
}
