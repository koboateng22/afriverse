// INTEGRATION: paystack — client side. The browser never sends an amount:
// it says WHAT is being bought; paystack-init prices it from the database
// (always GHS) and returns Paystack's hosted checkout URL.
import { FunctionError, invokeFunction } from '../../lib/functions';
import { formatMoney } from '../../lib/money';

export type CheckoutRequest =
  /** card = monthly auto-renew (Paystack plan); momo = one month, renew manually. */
  | { type: 'subscription'; method: 'card' | 'momo'; promo_code?: string }
  | { type: 'application'; university_id: string }
  | { type: 'mentor'; mentor_id: string; scheduled_at: string; topic?: string }
  /** Pay-as-you-go: unlock one CV's PDF (GH₵ 10) or one VIP human essay review (GH₵ 15). */
  | { type: 'purchase'; product: 'cv_download'; cv_id: string }
  | { type: 'purchase'; product: 'essay_review' };

/** amount_cents: what paystack-init is about to charge, in pesewas (newer servers send it). */
type InitResponse = { authorization_url: string; reference: string; amount_cents?: number; currency?: string };

export type CheckoutGuard = {
  /**
   * The price on screen, in whole pesewas (GH₵ 3.50 = 350). The server refuses the checkout
   * if its own price differs, and we refuse to redirect if its answer differs.
   */
  expectedCents?: number;
  /** Also refuse when the server doesn't say what it will charge (e.g. a promo price). */
  requireServerAmount?: boolean;
};

/** Full-page redirect (not a popup): MoMo approval prompts fail inside iframes. */
export function redirectToCheckout({ authorizationUrl }: { authorizationUrl: string }): void {
  window.location.href = authorizationUrl;
}

export async function startCheckout(req: CheckoutRequest, guard: CheckoutGuard = {}): Promise<void> {
  const { expectedCents, requireServerAmount } = guard;
  if (expectedCents !== undefined && (!Number.isSafeInteger(expectedCents) || expectedCents <= 0)) {
    throw new Error('Price error: amounts must be whole pesewas. Nothing was charged.');
  }
  const body = expectedCents === undefined ? req : { ...req, expected_amount_cents: expectedCents };
  let res: InitResponse;
  try {
    res = await invokeFunction<InitResponse>('paystack-init', body);
  } catch (e) {
    // An older paystack-init (before one-time purchases) rejects type 'purchase' with
    // "type: must be one of: subscription, application, mentor". Nothing was charged.
    if (e instanceof FunctionError && e.code === 'invalid_input' && e.body.field === 'type' && req.type === 'purchase') {
      console.error('paystack-init on the server is out of date: redeploy it (supabase functions deploy paystack-init).');
      throw new FunctionError(e.status, 'purchase_unavailable', 'One-time payments are being switched on. Nothing was charged; please try again a little later, or choose Pro.', e.body);
    }
    throw e;
  }
  if (expectedCents !== undefined) {
    // Never send a student to pay a different amount from the one on screen.
    if (typeof res.amount_cents === 'number' && res.amount_cents !== expectedCents) {
      throw new Error(`The checkout would charge ${formatMoney(res.amount_cents, 'GHS')}, not the ${formatMoney(expectedCents, 'GHS')} shown, so we stopped. Nothing was charged.`);
    }
    if (typeof res.amount_cents !== 'number' && requireServerAmount) {
      throw new Error('We can’t confirm the discounted price with the payment server right now, so we stopped before charging you. Please try again shortly.');
    }
  }
  if (!/^https?:\/\//.test(res.authorization_url ?? '')) throw new Error('Paystack did not return a checkout link.');
  redirectToCheckout({ authorizationUrl: res.authorization_url });
}

export type VerifyResponse = {
  status: 'pending' | 'success' | 'failed';
  kind: 'subscription' | 'application' | 'mentor' | 'purchase';
  related_id: string | null;
  failure_reason: string | null;
  amount_cents: number;
  currency: string;
  metadata: Record<string, unknown>;
};

export function verifyPayment(reference: string): Promise<VerifyResponse> {
  return invokeFunction<VerifyResponse>('paystack-verify', { reference });
}
