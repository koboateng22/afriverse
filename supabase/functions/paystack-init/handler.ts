// INTEGRATION: paystack — initializes a real Paystack transaction, in GHS.
// The amount is ALWAYS computed here from the database; anything the client
// sends about price is ignored.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { handle, HttpError, json, readJson } from '../_shared/http.ts';
import { optionalEnv } from '../_shared/env.ts';
import { isStudent, requireUser, serviceClient } from '../_shared/supabase.ts';
import { paystackRequest, paystackSecret } from '../_shared/paystack.ts';
import { oneOf, optStr, str, uuid } from '../_shared/validate.ts';

type Priced = {
  kind: 'subscription' | 'application' | 'mentor';
  amount: number;
  relatedId: string;
  channels: Array<'card' | 'mobile_money'>;
  planCode?: string;
  subaccount?: string;
  platformFee: number;
  payeeShare: number;
  extraMeta: Record<string, unknown>;
};

const MENTOR_PLATFORM_SHARE = 0.25; // Afriversity keeps 25%, mentor receives 75% (enforced via transaction_charge)
const SESSION_MINUTES = 60; // mentors price by the hour

/** Only redirect back to origins we trust (SITE_URL, comma-separated). */
function callbackBase(req: Request): string {
  const allowed = (optionalEnv('SITE_URL') ?? '').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
  const origin = (req.headers.get('Origin') ?? '').replace(/\/$/, '');
  if (allowed.length === 0) {
    if (!origin) throw new HttpError(400, 'no_origin', 'Cannot determine where to return after payment. Set SITE_URL.');
    return origin;
  }
  return allowed.includes(origin) ? origin : allowed[0];
}

async function must<T>(p: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw error;
  return data;
}

function assertGhs(currency: string) {
  if (currency !== 'GHS') throw new HttpError(409, 'currency_not_supported', 'All Afriversity payments are in GHS. Ask an admin to update this price.');
}

/** The Paystack plan for card auto-renew; created on first use and whenever the price changes. */
async function ensurePaystackPlan(svc: SupabaseClient, plan: { amount_cents: number; paystack_plan_code: string | null }): Promise<string> {
  if (plan.paystack_plan_code) return plan.paystack_plan_code;
  const created = await paystackRequest<{ plan_code: string }>('/plan', {
    method: 'POST',
    body: { name: `Afriversity Pro — GHS ${plan.amount_cents / 100}/month`, interval: 'monthly', amount: plan.amount_cents, currency: 'GHS' },
  });
  await must(svc.from('plans').update({ paystack_plan_code: created.plan_code }).eq('code', 'pro').is('paystack_plan_code', null));
  const { data } = await svc.from('plans').select('paystack_plan_code').eq('code', 'pro').single();
  return (data?.paystack_plan_code as string) ?? created.plan_code;
}

/**
 * The Pro row as migration 0016 sets it: GH₵ 40 (4000 pesewas) a month, human support.
 * Used only when the row is missing (e.g. a database built without seed.sql).
 */
const DEFAULT_PRO = {
  code: 'pro',
  name: 'Pro',
  tagline: 'A real counsellor in your corner',
  amount_cents: 4000,
  currency: 'GHS',
  period_days: 30,
  ai_daily_limit: null,
  features: [
    'Direct WhatsApp access to a Human Counselor',
    'CV & Essay Strategy Sessions',
    'Priority Support',
    'Scholarship Matcher — ranked by how well you fit',
    'Application Tracker with full timeline',
    'Insider application guides',
  ],
  active: true,
};

type ProPlan = { code: string; amount_cents: number; currency: string; active: boolean; paystack_plan_code: string | null };

/** The Pro plan row, created at the default price if it doesn't exist yet. */
async function proPlan(svc: SupabaseClient): Promise<ProPlan> {
  const read = () => svc.from('plans').select('code, amount_cents, currency, active, paystack_plan_code').eq('code', 'pro').maybeSingle();
  const { data, error } = await read();
  if (error) throw error;
  if (data) return data as ProPlan;
  console.warn('paystack-init: no pro plan row, creating it at the default GHS 40 price');
  // ignoreDuplicates: a concurrent checkout may have created it first; never overwrite an admin's price.
  await must(svc.from('plans').upsert(DEFAULT_PRO, { onConflict: 'code', ignoreDuplicates: true }));
  const again = await read();
  if (again.error) throw again.error;
  if (!again.data) throw new HttpError(500, 'plan_missing', 'The Pro plan could not be created. Run migration 0016.');
  return again.data as ProPlan;
}

async function priceSubscription(svc: SupabaseClient, userId: string, body: Record<string, unknown>): Promise<Priced> {
  // Card = Paystack plan, renews monthly. MoMo = one month (Paystack can't auto-charge MoMo).
  const method = oneOf(body.method, 'method', ['card', 'momo'] as const);
  const plan = await proPlan(svc);
  // An existing row that an admin switched off (Admin → Plans) is respected.
  if (!plan.active) throw new HttpError(404, 'plan_unavailable', 'Pro is not on sale right now');
  assertGhs(plan.currency);

  const { data: recurring } = await svc.from('billing_customers').select('status').eq('user_id', userId).maybeSingle();
  if (recurring?.status === 'active') {
    throw new HttpError(409, 'already_subscribed', 'Your card already renews Pro every month. Manage it from your profile.');
  }

  const planCode = method === 'card' ? await ensurePaystackPlan(svc, plan) : undefined;
  const sub = await must(
    svc
      .from('subscriptions')
      .insert({ user_id: userId, plan: 'pro', status: 'pending', currency: 'GHS', amount_cents: plan.amount_cents, billing: method === 'card' ? 'card_recurring' : 'momo_once' })
      .select('id')
      .single(),
  );
  return {
    kind: 'subscription',
    amount: plan.amount_cents,
    relatedId: (sub as { id: string }).id,
    channels: method === 'card' ? ['card'] : ['mobile_money'],
    planCode,
    platformFee: plan.amount_cents,
    payeeShare: 0,
    extraMeta: { plan: 'pro', billing: method },
  };
}

async function priceApplication(svc: SupabaseClient, userId: string, body: Record<string, unknown>): Promise<Priced> {
  const universityId = uuid(body.university_id, 'university_id');
  const { data: uni, error } = await svc
    .from('universities')
    .select('id, name, currency, app_fee_cents, service_fee_cents, active, form_fields')
    .eq('id', universityId)
    .maybeSingle();
  if (error) throw error;
  if (!uni || !uni.active) throw new HttpError(404, 'university_unavailable', 'That university is not accepting applications through Afriversity');
  assertGhs(uni.currency);

  // Already paid but the form isn't done? Send them back to it instead of charging twice.
  const { data: open } = await svc
    .from('applications')
    .select('id')
    .eq('user_id', userId)
    .eq('university_id', uni.id)
    .eq('status', 'Paid')
    .limit(1)
    .maybeSingle();
  if (open) throw new HttpError(409, 'form_pending', 'You have already paid for this university — finish your application form.', { application_id: open.id });

  const fee = uni.app_fee_cents + uni.service_fee_cents;
  if (fee <= 0) throw new HttpError(409, 'fee_not_set', 'This university has no application fee set yet');

  // Fee + form snapshot taken now — later admin edits never change this row.
  const app = await must(
    svc
      .from('applications')
      .insert({
        user_id: userId,
        university_id: uni.id,
        status: 'Pending Payment',
        currency: 'GHS',
        app_fee_cents: uni.app_fee_cents,
        service_fee_cents: uni.service_fee_cents,
        form_snapshot: uni.form_fields ?? {},
      })
      .select('id')
      .single(),
  );
  return {
    kind: 'application',
    amount: fee,
    relatedId: (app as { id: string }).id,
    channels: ['mobile_money', 'card'],
    platformFee: fee,
    payeeShare: 0,
    extraMeta: { university_id: uni.id, university: uni.name },
  };
}

async function priceMentor(svc: SupabaseClient, userId: string, body: Record<string, unknown>): Promise<Priced> {
  const mentorId = uuid(body.mentor_id, 'mentor_id');
  if (mentorId === userId) throw new HttpError(400, 'invalid_input', 'You cannot book yourself');
  const scheduledRaw = str(body.scheduled_at, 'scheduled_at', { max: 40 });
  const scheduled = new Date(scheduledRaw);
  if (Number.isNaN(scheduled.getTime())) throw new HttpError(400, 'invalid_input', 'scheduled_at must be an ISO date-time');
  const now = Date.now();
  if (scheduled.getTime() < now + 12 * 3_600_000) throw new HttpError(400, 'invalid_input', 'Book at least 12 hours ahead');
  if (scheduled.getTime() > now + 60 * 86_400_000) throw new HttpError(400, 'invalid_input', 'Book within the next 60 days');
  if (scheduled.getUTCMinutes() % 30 !== 0 || scheduled.getUTCSeconds() !== 0) throw new HttpError(400, 'invalid_input', 'Sessions start on the hour or half hour');
  const topic = optStr(body.topic, 'topic', 300);

  const { data: mentor, error } = await svc
    .from('mentors')
    .select('id, display_name, status, rate_cents, currency, subaccount_code')
    .eq('id', mentorId)
    .maybeSingle();
  if (error) throw error;
  if (!mentor || mentor.status !== 'approved') throw new HttpError(404, 'mentor_unavailable', 'This mentor is not available for booking');
  // rate_cents is the ADMIN-APPROVED hourly rate; a mentor's proposal never prices a booking.
  if (!mentor.rate_cents || mentor.rate_cents <= 0) throw new HttpError(409, 'mentor_not_priced', "This mentor's rate is still being reviewed");
  assertGhs(mentor.currency);
  if (!mentor.subaccount_code) throw new HttpError(409, 'mentor_payout_missing', "This mentor's payout account isn't set up yet, so bookings are paused");

  const { count } = await svc
    .from('mentor_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('mentor_id', mentorId)
    .eq('scheduled_at', scheduled.toISOString())
    .in('status', ['confirmed', 'completed']);
  if ((count ?? 0) > 0) throw new HttpError(409, 'slot_taken', 'That time is already booked — pick another');

  const session = await must(
    svc
      .from('mentor_sessions')
      .insert({
        mentor_id: mentorId,
        student_id: userId,
        scheduled_at: scheduled.toISOString(),
        duration_min: SESSION_MINUTES,
        topic,
        status: 'pending',
        currency: 'GHS',
        amount_cents: mentor.rate_cents,
      })
      .select('id')
      .single(),
  );
  const platformFee = Math.round(mentor.rate_cents * MENTOR_PLATFORM_SHARE);
  return {
    kind: 'mentor',
    amount: mentor.rate_cents,
    relatedId: (session as { id: string }).id,
    channels: ['mobile_money', 'card'],
    subaccount: mentor.subaccount_code,
    platformFee,
    payeeShare: mentor.rate_cents - platformFee,
    extraMeta: { mentor_id: mentorId, mentor: mentor.display_name, scheduled_at: scheduled.toISOString() },
  };
}

export const handler = handle(async (req) => {
  const svc = serviceClient();
  const caller = await requireUser(req, svc); // 401 on a missing/invalid JWT
  paystackSecret(); // 500 if PAYSTACK_SECRET_KEY is missing — before anything is written
  if (!isStudent(caller.role)) throw new HttpError(403, 'students_only', 'Only student accounts can make purchases');

  const body = await readJson(req);
  const type = oneOf(body.type, 'type', ['subscription', 'application', 'mentor'] as const);
  const base = callbackBase(req);

  const priced =
    type === 'subscription'
      ? await priceSubscription(svc, caller.user.id, body)
      : type === 'application'
        ? await priceApplication(svc, caller.user.id, body)
        : await priceMentor(svc, caller.user.id, body);

  const reference = `afv_${type.slice(0, 3)}_${crypto.randomUUID().replace(/-/g, '')}`;
  const payment = await must(
    svc
      .from('payments')
      .insert({
        user_id: caller.user.id,
        kind: priced.kind,
        reference,
        status: 'pending',
        currency: 'GHS',
        amount_cents: priced.amount,
        platform_fee_cents: priced.platformFee,
        payee_share_cents: priced.payeeShare,
        related_id: priced.relatedId,
        metadata: priced.extraMeta,
      })
      .select('id')
      .single(),
  );
  const paymentId = (payment as { id: string }).id;
  const table = priced.kind === 'application' ? 'applications' : priced.kind === 'mentor' ? 'mentor_sessions' : 'subscriptions';
  await must(svc.from(table).update({ payment_ref: reference }).eq('id', priced.relatedId));

  // Phone-only accounts have no email; Paystack requires one for the receipt.
  const email = caller.user.email ?? `${caller.user.id}@users.afriversity.app`;

  try {
    const data = await paystackRequest<{ authorization_url: string; access_code: string; reference: string }>('/transaction/initialize', {
      method: 'POST',
      body: {
        email,
        amount: priced.amount, // pesewas, straight from the DB
        currency: 'GHS',
        reference,
        callback_url: `${base}/checkout?ref=${encodeURIComponent(reference)}`,
        channels: priced.channels,
        ...(priced.planCode ? { plan: priced.planCode } : {}),
        // Split enforced per transaction: transaction_charge (pesewas) goes to Afriversity
        // regardless of the subaccount's own percentage setting; the rest settles to the mentor.
        // bearer 'account' = Afriversity absorbs Paystack's fee, so the mentor gets a clean 75%.
        ...(priced.subaccount ? { subaccount: priced.subaccount, transaction_charge: priced.platformFee, bearer: 'account' } : {}),
        metadata: {
          type: priced.kind,
          user_id: caller.user.id,
          payment_id: paymentId,
          related_id: priced.relatedId,
          ...priced.extraMeta,
        },
      },
    });
    return json({ authorization_url: data.authorization_url, reference: data.reference });
  } catch (err) {
    // Leave nothing dangling: the payment and the row it would pay for are marked failed.
    const reason = err instanceof Error ? err.message : 'initialize_failed';
    await svc.from('payments').update({ status: 'failed', failure_reason: reason }).eq('id', paymentId);
    if (priced.kind === 'subscription') await svc.from('subscriptions').update({ status: 'failed' }).eq('id', priced.relatedId);
    if (priced.kind === 'application') await svc.from('applications').update({ status: 'Failed', status_note: reason }).eq('id', priced.relatedId);
    if (priced.kind === 'mentor') await svc.from('mentor_sessions').update({ status: 'failed' }).eq('id', priced.relatedId);
    throw err;
  }
});
