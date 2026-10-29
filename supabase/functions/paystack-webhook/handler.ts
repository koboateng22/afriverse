// INTEGRATION: paystack — receives signed events from Paystack.
// Deploy with --no-verify-jwt: Paystack does not send a Supabase JWT; the
// HMAC-SHA512 signature is the authentication. Nothing is unlocked or
// confirmed until a signed event (or a server-side verify) says it was paid.
import { json, errorResponse } from '../_shared/http.ts';
import { serviceClient } from '../_shared/supabase.ts';
import { failCharge, fulfillCharge, renewSubscription, userForCustomer } from '../_shared/fulfill.ts';
import { planCodeOf, verifyPaystackSignature, type PaystackTransaction } from '../_shared/paystack.ts';

type SubscriptionEvent = {
  subscription_code?: string;
  email_token?: string;
  status?: string;
  next_payment_date?: string | null;
  customer?: { customer_code?: string; email?: string };
};

type PaystackEvent = { event: string; data: PaystackTransaction & SubscriptionEvent };

export async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  try {
    const raw = await req.text(); // raw body — must not be re-serialised before hashing
    const valid = await verifyPaystackSignature(raw, req.headers.get('x-paystack-signature'));
    if (!valid) return json({ error: 'invalid_signature' }, 401);

    let event: PaystackEvent;
    try {
      event = JSON.parse(raw) as PaystackEvent;
    } catch {
      return json({ error: 'bad_json' }, 400);
    }
    const svc = serviceClient();
    const d = event.data ?? ({} as PaystackEvent['data']);

    switch (event.event) {
      case 'charge.success': {
        if (!d.reference) return json({ received: true, ignored: 'no_reference' });
        const { data: known } = await svc.from('payments').select('id').eq('reference', d.reference).maybeSingle();
        // Our own checkout → fulfil it. Unknown reference on a plan → monthly card renewal.
        const result = known || !planCodeOf(d) ? await fulfillCharge(svc, d) : await renewSubscription(svc, d);
        return json({ received: true, result });
      }
      case 'charge.failed': {
        if (!d.reference) return json({ received: true, ignored: 'no_reference' });
        const result = await failCharge(svc, d.reference, d.gateway_response ?? 'charge_failed');
        return json({ received: true, result });
      }
      case 'subscription.create': {
        const userId = await userForCustomer(svc, d.customer);
        if (!userId || !d.subscription_code) return json({ received: true, ignored: 'unknown_customer' });
        const { error } = await svc.from('billing_customers').upsert(
          {
            user_id: userId,
            customer_code: d.customer?.customer_code ?? null,
            subscription_code: d.subscription_code,
            email_token: d.email_token ?? null,
            status: 'active',
            next_payment_date: d.next_payment_date ?? null,
          },
          { onConflict: 'user_id' },
        );
        if (error) throw error;
        return json({ received: true, result: 'subscription_recorded' });
      }
      case 'subscription.not_renew':
      case 'subscription.disable': {
        if (!d.subscription_code) return json({ received: true, ignored: 'no_subscription_code' });
        const status = event.event === 'subscription.disable' ? 'cancelled' : 'non-renewing';
        // Access continues until the current month's expires_at; it just won't renew.
        const { error } = await svc.from('billing_customers').update({ status, next_payment_date: null }).eq('subscription_code', d.subscription_code);
        if (error) throw error;
        return json({ received: true, result: status });
      }
      case 'invoice.payment_failed':
        // No change needed: access simply ends at expires_at unless a later retry succeeds.
        console.warn('Pro renewal failed for subscription', d.subscription_code ?? '(unknown)');
        return json({ received: true, result: 'renewal_failed_logged' });
      default:
        // Acknowledge everything else so Paystack doesn't retry it.
        return json({ received: true, ignored: event.event });
    }
  } catch (err) {
    // 5xx makes Paystack retry later, which is what we want for DB hiccups.
    return errorResponse(err);
  }
}
