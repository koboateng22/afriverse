-- 0009 — Revenue reporting for the admin console. Only the service role
-- (the admin-api edge function, after it has verified the caller is an admin)
-- can execute this. Amounts are grouped by currency and never converted.
-- Payments flagged for refund (failure_reason set on a success row, e.g. a
-- double-booked mentor slot) are excluded until resolved.

create or replace function public.revenue_summary()
returns table (
  currency                   text,
  subscriptions_revenue      bigint,
  service_fees_collected     bigint,
  university_fees_collected  bigint,
  mentor_commission          bigint,
  mentor_payouts             bigint,
  net_revenue                bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with paid_apps as (
    select a.currency, a.service_fee_cents, a.app_fee_cents
    from public.applications a
    where a.status not in ('Pending Payment', 'Failed')
  ),
  rows as (
    select p.currency, p.amount_cents as subs, 0::bigint as svc, 0::bigint as uni, 0::bigint as comm, 0::bigint as payout
      from public.payments p where p.kind = 'subscription' and p.status = 'success' and p.failure_reason is null
    union all
    select currency, 0, service_fee_cents, app_fee_cents, 0, 0 from paid_apps
    union all
    select p.currency, 0, 0, 0, p.platform_fee_cents, p.payee_share_cents
      from public.payments p where p.kind = 'mentor' and p.status = 'success' and p.failure_reason is null
  )
  select r.currency,
         sum(r.subs)::bigint,
         sum(r.svc)::bigint,
         sum(r.uni)::bigint,
         sum(r.comm)::bigint,
         sum(r.payout)::bigint,
         (sum(r.subs) + sum(r.svc) + sum(r.comm))::bigint
  from rows r
  group by r.currency
  order by r.currency;
$$;
revoke all on function public.revenue_summary() from public, anon, authenticated;
grant execute on function public.revenue_summary() to service_role;
