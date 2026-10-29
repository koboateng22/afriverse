// INTEGRATION: paystack — lets a Pro student stop card auto-renew or update
// their card. Access always runs to the end of the month already paid for.
import { handle, HttpError, json, readJson } from '../_shared/http.ts';
import { requireUser, serviceClient } from '../_shared/supabase.ts';
import { paystackRequest } from '../_shared/paystack.ts';
import { oneOf } from '../_shared/validate.ts';

export const handler = handle(async (req) => {
  const svc = serviceClient();
  const caller = await requireUser(req, svc);
  const body = await readJson(req);
  const action = oneOf(body.action, 'action', ['cancel', 'manage_link'] as const);

  const { data: billing, error } = await svc
    .from('billing_customers')
    .select('subscription_code, email_token, status')
    .eq('user_id', caller.user.id)
    .maybeSingle();
  if (error) throw error;
  if (!billing?.subscription_code) throw new HttpError(404, 'no_subscription', "You don't have a card subscription that renews");

  if (action === 'manage_link') {
    const data = await paystackRequest<{ link: string }>(`/subscription/${encodeURIComponent(billing.subscription_code)}/manage/link`, { method: 'GET' });
    return json({ link: data.link });
  }

  if (billing.status !== 'active') return json({ status: billing.status });
  if (!billing.email_token) throw new HttpError(409, 'not_ready', 'Paystack is still setting up your subscription — try again in a minute');
  await paystackRequest('/subscription/disable', { method: 'POST', body: { code: billing.subscription_code, token: billing.email_token } });
  const { error: e2 } = await svc.from('billing_customers').update({ status: 'non-renewing', next_payment_date: null }).eq('user_id', caller.user.id);
  if (e2) throw e2;
  return json({ status: 'non-renewing' });
});
