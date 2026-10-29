// Turns a Paystack charge into database state. Shared by paystack-webhook
// (signed events) and paystack-verify (server-side lookup by reference) so
// both paths behave identically and idempotently.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { metadataOf, planCodeOf, type PaystackTransaction } from './paystack.ts';

/** Card subscribers get a few days' grace so the monthly renewal lands before access ends. */
const CARD_GRACE_MS = 3 * 86_400_000;

type PaymentRow = {
  id: string;
  user_id: string;
  kind: 'subscription' | 'application' | 'mentor';
  reference: string;
  status: 'pending' | 'success' | 'failed';
  currency: string;
  amount_cents: number;
  related_id: string | null;
  metadata: Record<string, unknown>;
};

export type FulfillResult =
  | { ok: true; already: boolean; kind: PaymentRow['kind']; related_id: string | null; user_id: string }
  | { ok: false; reason: string };

/** Adds calendar months, clamping to the last day (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(d: Date, months: number): Date {
  const out = new Date(d.getTime());
  const day = out.getUTCDate();
  out.setUTCDate(1);
  out.setUTCMonth(out.getUTCMonth() + months);
  const last = new Date(Date.UTC(out.getUTCFullYear(), out.getUTCMonth() + 1, 0)).getUTCDate();
  out.setUTCDate(Math.min(day, last));
  return out;
}

async function loadPayment(svc: SupabaseClient, reference: string): Promise<PaymentRow | null> {
  const { data, error } = await svc
    .from('payments')
    .select('id, user_id, kind, reference, status, currency, amount_cents, related_id, metadata')
    .eq('reference', reference)
    .maybeSingle();
  if (error) throw error;
  return data as PaymentRow | null;
}

async function must<T>(p: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw error;
  return data;
}

/** Maps a Paystack customer to our user: stored customer code → our placeholder email → auth email. */
export async function userForCustomer(svc: SupabaseClient, customer: PaystackTransaction['customer']): Promise<string | null> {
  if (!customer) return null;
  if (customer.customer_code) {
    const { data } = await svc.from('billing_customers').select('user_id').eq('customer_code', customer.customer_code).maybeSingle();
    if (data?.user_id) return data.user_id as string;
  }
  const email = customer.email ?? '';
  const placeholder = /^([0-9a-f-]{36})@users\.afriversity\.app$/i.exec(email);
  if (placeholder) return placeholder[1];
  if (!email) return null;
  const { data, error } = await svc.rpc('user_id_by_email', { p_email: email });
  if (error) throw error;
  return (data as string | null) ?? null;
}

/** Marks a pending payment (and the row it pays for) as failed. Idempotent. */
export async function failCharge(svc: SupabaseClient, reference: string, reason: string): Promise<FulfillResult> {
  const payment = await loadPayment(svc, reference);
  if (!payment) return { ok: false, reason: 'unknown_reference' };
  if (payment.status !== 'pending') return { ok: false, reason: `payment_already_${payment.status}` };

  await must(svc.from('payments').update({ status: 'failed', failure_reason: reason }).eq('id', payment.id).eq('status', 'pending'));
  if (payment.related_id) {
    if (payment.kind === 'subscription') {
      await must(svc.from('subscriptions').update({ status: 'failed' }).eq('id', payment.related_id).eq('status', 'pending'));
    } else if (payment.kind === 'application') {
      await must(svc.from('applications').update({ status: 'Failed', status_note: reason }).eq('id', payment.related_id).eq('status', 'Pending Payment'));
    } else {
      await must(svc.from('mentor_sessions').update({ status: 'failed' }).eq('id', payment.related_id).eq('status', 'pending'));
    }
  }
  return { ok: false, reason };
}

/**
 * Applies a successful charge that paystack-init created. Validates amount,
 * currency and metadata against the pending payment row — the charge must
 * match what the server priced, or nothing is granted.
 */
export async function fulfillCharge(svc: SupabaseClient, tx: PaystackTransaction): Promise<FulfillResult> {
  const payment = await loadPayment(svc, tx.reference);
  if (!payment) return { ok: false, reason: 'unknown_reference' };
  if (payment.status === 'success') {
    return { ok: true, already: true, kind: payment.kind, related_id: payment.related_id, user_id: payment.user_id };
  }
  if (payment.status === 'failed') return { ok: false, reason: 'payment_already_failed' };

  const meta = metadataOf(tx);
  if (tx.amount !== payment.amount_cents || tx.currency !== payment.currency || tx.currency !== 'GHS') {
    return failCharge(svc, tx.reference, `amount_mismatch: charged ${tx.amount} ${tx.currency}, expected ${payment.amount_cents} ${payment.currency}`);
  }
  if (meta.user_id !== payment.user_id || meta.type !== payment.kind || meta.payment_id !== payment.id) {
    return failCharge(svc, tx.reference, 'metadata_mismatch');
  }

  const { data: profile } = await svc.from('profiles').select('id').eq('id', payment.user_id).maybeSingle();
  if (!profile) return failCharge(svc, tx.reference, 'user_missing');

  const paidAt = tx.paid_at ?? new Date().toISOString();
  // Conditional update = idempotency guard if webhook and verify race.
  const claimed = await must(
    svc
      .from('payments')
      .update({ status: 'success', channel: tx.channel, paid_at: paidAt, raw_event: tx as unknown as Record<string, unknown> })
      .eq('id', payment.id)
      .eq('status', 'pending')
      .select('id'),
  );
  if (!claimed || (claimed as unknown[]).length === 0) {
    return { ok: true, already: true, kind: payment.kind, related_id: payment.related_id, user_id: payment.user_id };
  }

  if (payment.kind === 'subscription' && payment.related_id) {
    const sub = (await must(svc.from('subscriptions').select('id, billing').eq('id', payment.related_id).single())) as { billing: string };
    if (sub.billing === 'card_recurring') {
      // Paystack renews monthly from the first charge; each charge opens its own window.
      const start = new Date(paidAt);
      await must(
        svc
          .from('subscriptions')
          .update({ status: 'active', starts_at: start.toISOString(), expires_at: new Date(addMonths(start, 1).getTime() + CARD_GRACE_MS).toISOString(), payment_ref: tx.reference })
          .eq('id', payment.related_id),
      );
      await must(
        svc.from('billing_customers').upsert(
          { user_id: payment.user_id, customer_code: tx.customer?.customer_code ?? null, status: 'active' },
          { onConflict: 'user_id' },
        ),
      );
    } else {
      // Mobile Money month: stacks onto any time still left.
      const { data: current } = await svc
        .from('subscriptions')
        .select('expires_at')
        .eq('user_id', payment.user_id)
        .eq('status', 'active')
        .gt('expires_at', new Date().toISOString())
        .order('expires_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const start = current?.expires_at ? new Date(current.expires_at as string) : new Date(paidAt);
      await must(
        svc
          .from('subscriptions')
          .update({ status: 'active', starts_at: start.toISOString(), expires_at: addMonths(start, 1).toISOString(), payment_ref: tx.reference })
          .eq('id', payment.related_id),
      );
    }
  } else if (payment.kind === 'application' && payment.related_id) {
    // Paid → the student now completes the university's form.
    await must(svc.from('applications').update({ status: 'Paid', payment_ref: tx.reference }).eq('id', payment.related_id));
  } else if (payment.kind === 'mentor' && payment.related_id) {
    const { error } = await svc.from('mentor_sessions').update({ status: 'confirmed', payment_ref: tx.reference }).eq('id', payment.related_id);
    if (error) {
      // 23505: someone else confirmed the same slot first. Money was taken, so flag for a refund.
      const code = (error as { code?: string }).code;
      await must(svc.from('mentor_sessions').update({ status: 'failed' }).eq('id', payment.related_id));
      await must(svc.from('payments').update({ failure_reason: code === '23505' ? 'slot_taken_refund_required' : `confirm_failed_refund_required: ${error.message}` }).eq('id', payment.id));
      return { ok: false, reason: 'slot_taken_refund_required' };
    }
  }

  return { ok: true, already: false, kind: payment.kind, related_id: payment.related_id, user_id: payment.user_id };
}

/**
 * Monthly renewal of a card subscription. Paystack creates these charges
 * itself, so there is no pending row: we identify the student by customer,
 * record the payment and open a new month. Idempotent on the reference.
 */
export async function renewSubscription(svc: SupabaseClient, tx: PaystackTransaction): Promise<FulfillResult> {
  if (!planCodeOf(tx)) return { ok: false, reason: 'not_a_plan_charge' };
  if (tx.status !== 'success' || tx.currency !== 'GHS' || !(tx.amount > 0)) return { ok: false, reason: 'invalid_renewal_charge' };

  const userId = await userForCustomer(svc, tx.customer);
  if (!userId) return { ok: false, reason: 'unknown_customer' };

  const paidAt = new Date(tx.paid_at ?? Date.now());
  const sub = (await must(
    svc
      .from('subscriptions')
      .insert({
        user_id: userId,
        plan: 'pro',
        status: 'pending',
        billing: 'card_recurring',
        currency: 'GHS',
        amount_cents: tx.amount,
        payment_ref: null,
      })
      .select('id')
      .single(),
  )) as { id: string };

  const { error } = await svc.from('payments').insert({
    user_id: userId,
    kind: 'subscription',
    reference: tx.reference,
    status: 'success',
    currency: 'GHS',
    amount_cents: tx.amount,
    platform_fee_cents: tx.amount,
    payee_share_cents: 0,
    channel: tx.channel,
    related_id: sub.id,
    paid_at: paidAt.toISOString(),
    metadata: { renewal: true, plan_code: planCodeOf(tx) },
    raw_event: tx as unknown as Record<string, unknown>,
  });
  if (error) {
    await svc.from('subscriptions').delete().eq('id', sub.id);
    if ((error as { code?: string }).code === '23505') return { ok: true, already: true, kind: 'subscription', related_id: null, user_id: userId };
    throw error;
  }

  await must(
    svc
      .from('subscriptions')
      .update({ status: 'active', starts_at: paidAt.toISOString(), expires_at: new Date(addMonths(paidAt, 1).getTime() + CARD_GRACE_MS).toISOString(), payment_ref: tx.reference })
      .eq('id', sub.id),
  );
  await must(
    svc.from('billing_customers').upsert({ user_id: userId, customer_code: tx.customer?.customer_code ?? null, status: 'active' }, { onConflict: 'user_id' }),
  );
  return { ok: true, already: false, kind: 'subscription', related_id: sub.id, user_id: userId };
}
