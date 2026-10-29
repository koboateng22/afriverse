// Scheduled job (run hourly or daily): renewal reminders at 3 days and 1 day
// before expiry, flips lapsed subscriptions to 'expired', and emails the user.
// Access still ends exactly at expires_at even if this job never runs —
// active_plan() compares against now(); this job only tidies status + emails.
import { errorResponse, json } from '../_shared/http.ts';
import { optionalEnv, requireEnv } from '../_shared/env.ts';
import { serviceClient } from '../_shared/supabase.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

type SubRow = { id: string; user_id: string; plan: string; expires_at: string; billing?: string };

const HOUR = 3_600_000;

async function emailFor(svc: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await svc.auth.admin.getUserById(userId);
  return data.user?.email ?? null;
}

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const key = requireEnv('RESEND_API_KEY');
  const from = optionalEnv('RESEND_FROM') ?? 'Afriversity <onboarding@resend.dev>';
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!res.ok) throw new Error(`Resend error ${res.status}: ${await res.text()}`);
}

const siteUrl = () => (optionalEnv('SITE_URL') ?? '').split(',')[0]?.trim().replace(/\/$/, '') || '';

function template(title: string, body: string): string {
  const link = siteUrl() ? `<p><a href="${siteUrl()}/paywall" style="color:#0E7C5A;font-weight:700">Renew on Afriversity</a></p>` : '';
  return `<div style="font-family:Manrope,Arial,sans-serif;font-size:16px;line-height:1.6;color:#0A0E0D"><h2 style="margin:0 0 12px">${title}</h2><p>${body}</p>${link}<p style="color:#6B7A74;font-size:13px">Plans renew manually — you will never be charged automatically.</p></div>`;
}

const planName = (_p: string) => 'Pro';

export async function handler(req: Request): Promise<Response> {
  try {
    // Only the scheduler (holding the service-role key) may run this.
    const auth = req.headers.get('Authorization') ?? '';
    if (auth !== `Bearer ${requireEnv('SUPABASE_SERVICE_ROLE_KEY')}`) return json({ error: 'unauthorized' }, 401);
    requireEnv('RESEND_API_KEY'); // fail loudly before doing any work

    const svc = serviceClient();
    const now = Date.now();
    const report = { reminded_3d: 0, reminded_1d: 0, expired: 0, emails_failed: 0 };

    const remind = async (window: number, column: 'reminded_3d_at' | 'reminded_1d_at', label: string) => {
      const { data, error } = await svc
        .from('subscriptions')
        .select('id, user_id, plan, expires_at, billing')
        .eq('status', 'active')
        .is(column, null)
        .gt('expires_at', new Date(now).toISOString())
        .lte('expires_at', new Date(now + window).toISOString());
      if (error) throw error;
      for (const s of (data ?? []) as SubRow[]) {
        // Skip if the user already renewed (a later row exists).
        const { count } = await svc
          .from('subscriptions')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', s.user_id)
          .eq('status', 'active')
          .gt('expires_at', s.expires_at);
        // Card subscriptions that still auto-renew don't need a reminder.
        let renewsByCard = false;
        if (s.billing === 'card_recurring') {
          const { data: b } = await svc.from('billing_customers').select('status').eq('user_id', s.user_id).maybeSingle();
          renewsByCard = b?.status === 'active';
        }
        if ((count ?? 0) > 0 || renewsByCard) {
          await svc.from('subscriptions').update({ [column]: new Date().toISOString() }).eq('id', s.id);
          continue;
        }
        const to = await emailFor(svc, s.user_id);
        try {
          if (to) {
            const when = new Date(s.expires_at).toUTCString();
            await sendEmail(to, `Your Afriversity ${planName(s.plan)} plan ends ${label}`, template(`Your ${planName(s.plan)} plan ends ${label}`, `Your plan is active until <strong>${when}</strong>. Renew with Mobile Money or card before then to keep your Pro benefits without a gap.`));
          }
          await svc.from('subscriptions').update({ [column]: new Date().toISOString() }).eq('id', s.id);
          if (column === 'reminded_3d_at') report.reminded_3d++;
          else report.reminded_1d++;
        } catch (e) {
          console.error(e);
          report.emails_failed++;
        }
      }
    };

    await remind(72 * HOUR, 'reminded_3d_at', 'in 3 days');
    await remind(24 * HOUR, 'reminded_1d_at', 'tomorrow');

    // Expire stale rows and tell the user.
    const { data: stale, error } = await svc
      .from('subscriptions')
      .update({ status: 'expired' })
      .eq('status', 'active')
      .lte('expires_at', new Date(now).toISOString())
      .select('id, user_id, plan, expires_at');
    if (error) throw error;
    for (const s of (stale ?? []) as SubRow[]) {
      report.expired++;
      const { count } = await svc
        .from('subscriptions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', s.user_id)
        .eq('status', 'active')
        .gt('expires_at', new Date(now).toISOString());
      if ((count ?? 0) > 0) continue; // they already have a newer plan running
      const to = await emailFor(svc, s.user_id);
      if (!to) continue;
      try {
        await sendEmail(to, `Your Afriversity ${planName(s.plan)} plan has ended`, template(`Your ${planName(s.plan)} plan has ended`, 'Your account is back on the free plan. Everything you saved is still there — renew any time to pick up where you left off.'));
      } catch (e) {
        console.error(e);
        report.emails_failed++;
      }
    }

    // Abandoned checkouts: pending rows older than a day are marked failed.
    const dayAgo = new Date(now - 24 * HOUR).toISOString();
    await svc.from('subscriptions').update({ status: 'failed' }).eq('status', 'pending').lt('created_at', dayAgo);
    await svc.from('payments').update({ status: 'failed', failure_reason: 'abandoned' }).eq('status', 'pending').lt('created_at', dayAgo);
    await svc.from('applications').update({ status: 'Failed', status_note: 'Payment was not completed' }).eq('status', 'Pending Payment').lt('created_at', dayAgo);
    await svc.from('mentor_sessions').update({ status: 'failed' }).eq('status', 'pending').lt('created_at', dayAgo);

    return json({ ok: true, ...report });
  } catch (err) {
    return errorResponse(err);
  }
}
