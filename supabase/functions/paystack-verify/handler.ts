// INTEGRATION: paystack — /checkout polls this. If the webhook already did the
// work it just reports status; otherwise it asks Paystack directly
// (GET /transaction/verify/:reference) and applies the same fulfilment.
import { handle, HttpError, json, readJson } from '../_shared/http.ts';
import { requireUser, serviceClient } from '../_shared/supabase.ts';
import { failCharge, fulfillCharge } from '../_shared/fulfill.ts';
import { paystackRequest, type PaystackTransaction } from '../_shared/paystack.ts';
import { str } from '../_shared/validate.ts';

export const handler = handle(async (req) => {
  const svc = serviceClient();
  const caller = await requireUser(req, svc);
  const body = await readJson(req);
  const reference = str(body.reference, 'reference', { min: 6, max: 100 });

  const { data: payment, error } = await svc
    .from('payments')
    .select('id, user_id, kind, status, related_id, failure_reason, amount_cents, currency, metadata')
    .eq('reference', reference)
    .maybeSingle();
  if (error) throw error;
  if (!payment || payment.user_id !== caller.user.id) throw new HttpError(404, 'not_found', 'Payment not found');

  if (payment.status === 'pending') {
    const tx = await paystackRequest<PaystackTransaction>(`/transaction/verify/${encodeURIComponent(reference)}`, { method: 'GET' });
    if (tx.status === 'success') await fulfillCharge(svc, tx);
    else if (tx.status === 'failed' || tx.status === 'reversed') await failCharge(svc, reference, tx.gateway_response ?? tx.status);
    // 'abandoned' / 'ongoing' / 'pending': the customer hasn't finished — keep polling.
  }

  const { data: fresh, error: e2 } = await svc
    .from('payments')
    .select('status, kind, related_id, failure_reason, amount_cents, currency, metadata')
    .eq('id', payment.id)
    .single();
  if (e2) throw e2;
  return json(fresh);
});
