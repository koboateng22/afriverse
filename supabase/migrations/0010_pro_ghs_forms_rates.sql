-- 0010 — v2 business model.
--   • One paid tier: Pro, GHS 60 / month. Card payments auto-renew through a
--     Paystack plan; Mobile Money buys one month at a time (Paystack cannot
--     auto-charge MoMo).
--   • Every price is in GHS.
--   • Universities: single application fee, description, and a per-university
--     application form (which fields the student must complete after paying).
--   • Applications: 'Paid' state between payment and form submission; form
--     answers + uploaded documents (private Storage bucket).
--   • Mentors propose an hourly GHS rate; an admin approves it.
--   • Pro-only RPCs: scholarship_matches(), counselor_contact().

-- ═════════════════════════════════════════════════════════════════════════
-- Plans: Pro only, GHS 60, unlimited AI
-- ═════════════════════════════════════════════════════════════════════════
update public.subscriptions set plan = 'pro' where plan = 'plus';
alter table public.subscriptions drop constraint subscriptions_plan_check;
alter table public.subscriptions add constraint subscriptions_plan_check check (plan = 'pro');

alter table public.subscriptions
  add column billing text not null default 'momo_once' check (billing in ('card_recurring', 'momo_once'));

delete from public.plans where code = 'plus';
alter table public.plans drop constraint plans_code_check;
alter table public.plans add constraint plans_code_check check (code = 'pro');

-- NULL ai_daily_limit = unlimited.
alter table public.plans alter column ai_daily_limit drop not null;
alter table public.plans drop constraint plans_ai_daily_limit_check;
alter table public.plans add constraint plans_ai_daily_limit_check check (ai_daily_limit is null or ai_daily_limit > 0);

-- Paystack plan used for card auto-renew. Cleared whenever the price changes
-- so paystack-init creates a fresh Paystack plan at the new amount.
alter table public.plans add column paystack_plan_code text;
revoke select on public.plans from anon, authenticated;
grant select (code, name, tagline, amount_cents, currency, period_days, ai_daily_limit, features, active, updated_at)
  on public.plans to anon, authenticated;

update public.plans
   set name = 'Pro',
       tagline = 'Everything you need to win a place',
       amount_cents = 6000,
       currency = 'GHS',
       period_days = 30,
       ai_daily_limit = null,
       paystack_plan_code = null,
       features = array[
         'Unlimited AI counsellor messages',
         'Scholarship Matcher — ranked by how well you fit',
         'AI Essay Reviewer',
         'Application Tracker with full timeline',
         'Human counsellor on WhatsApp'
       ]
 where code = 'pro';

-- ═════════════════════════════════════════════════════════════════════════
-- GHS everywhere
-- ═════════════════════════════════════════════════════════════════════════
-- Universities move to a single application fee. Ghana rows: fee = old app +
-- service fee. Naira rows: converted at the mid-market rate on 29 Oct 2026
-- (1 NGN = 0.008639 GHS) and rounded to the nearest cedi — admins can edit.
update public.universities
   set app_fee_cents = case
         when currency = 'NGN' then (round((app_fee_cents + service_fee_cents) / 100.0 * 0.008639) * 100)::int
         else app_fee_cents + service_fee_cents
       end,
       service_fee_cents = 0,
       currency = 'GHS'
 where currency <> 'GHS' or service_fee_cents <> 0;

alter table public.universities drop constraint universities_currency_check;
alter table public.universities add constraint universities_currency_check check (currency = 'GHS');
alter table public.universities alter column currency set default 'GHS';
alter table public.universities alter column service_fee_cents set default 0;

-- Mentors: any non-GHS rate is cleared and must be re-proposed in GHS.
update public.mentors set rate_cents = null, currency = 'GHS' where currency <> 'GHS';
alter table public.mentors drop constraint mentors_currency_check;
alter table public.mentors add constraint mentors_currency_check check (currency = 'GHS');

alter table public.plans drop constraint plans_currency_check;
alter table public.plans add constraint plans_currency_check check (currency = 'GHS');

-- ═════════════════════════════════════════════════════════════════════════
-- Mentor rate proposals (hourly, GHS) — admin approves
-- ═════════════════════════════════════════════════════════════════════════
alter table public.mentors
  add column proposed_rate_cents integer check (proposed_rate_cents is null or proposed_rate_cents between 1000 and 10000000),
  add column rate_review text not null default 'none' check (rate_review in ('none', 'pending', 'approved', 'rejected'));

-- Mentors can no longer set the live rate or currency themselves.
revoke update (rate_cents, currency) on public.mentors from authenticated;
grant update (proposed_rate_cents) on public.mentors to authenticated;
grant select (proposed_rate_cents, rate_review) on public.mentors to authenticated;

create or replace function public.mentor_rate_proposed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.proposed_rate_cents is distinct from old.proposed_rate_cents
     and coalesce(public.request_role(), '') in ('anon', 'authenticated')
     and not public.is_admin() then
    new.rate_review := case when new.proposed_rate_cents is null then 'none' else 'pending' end;
  end if;
  return new;
end;
$$;

create trigger mentors_rate_proposed
  before update on public.mentors
  for each row execute function public.mentor_rate_proposed();

-- Approved mentors' proposed rates are private to the mentor and admins.
-- (Students read rate_cents — the approved one.)

alter table public.mentor_sessions alter column duration_min set default 60;

-- ═════════════════════════════════════════════════════════════════════════
-- Card auto-renew bookkeeping (one row per student)
-- ═════════════════════════════════════════════════════════════════════════
create table public.billing_customers (
  user_id            uuid primary key references public.profiles (id) on delete cascade,
  customer_code      text unique,
  subscription_code  text unique,
  email_token        text,
  status             text not null default 'active' check (status in ('active', 'non-renewing', 'cancelled')),
  next_payment_date  timestamptz,
  updated_at         timestamptz not null default now()
);
create trigger billing_customers_set_updated_at before update on public.billing_customers
  for each row execute function public.set_updated_at();

alter table public.billing_customers enable row level security;
create policy "billing_customers: read own" on public.billing_customers for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.billing_customers from anon, authenticated;
-- email_token is only ever used server-side to cancel; never expose it.
grant select (user_id, status, next_payment_date, updated_at) on public.billing_customers to authenticated;

-- Webhooks identify customers by email; this maps it back to a user.
create or replace function public.user_id_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1;
$$;
revoke all on function public.user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.user_id_by_email(text) to service_role;

-- ═════════════════════════════════════════════════════════════════════════
-- Universities: description + application form builder
-- ═════════════════════════════════════════════════════════════════════════
-- form_fields: {
--   "high_school": bool, "waec_results": bool, "guardian_name": bool,
--   "guardian_email": bool, "guardian_occupation": bool,
--   "custom_documents": [{ "key": "doc_passport_photo", "label": "Passport photo" }]
-- }
alter table public.universities
  add column description text check (char_length(description) <= 2000),
  add column form_fields jsonb not null default '{}'::jsonb check (jsonb_typeof(form_fields) = 'object');

-- ═════════════════════════════════════════════════════════════════════════
-- Applications: Paid → (form) → Submitted
-- ═════════════════════════════════════════════════════════════════════════
alter table public.applications drop constraint applications_status_check;
alter table public.applications add constraint applications_status_check
  check (status in ('Pending Payment', 'Paid', 'Submitted', 'In Review', 'Offer', 'Rejected', 'Withdrawn', 'Failed'));

alter table public.applications alter column program drop not null;
alter table public.applications
  add column form_snapshot jsonb not null default '{}'::jsonb,   -- the university's form at payment time
  add column form_data     jsonb not null default '{}'::jsonb,   -- the student's text answers
  add column documents     jsonb not null default '[]'::jsonb,   -- [{ key, label, path, name, size, type }]
  add column submitted_at  timestamptz;

-- ═════════════════════════════════════════════════════════════════════════
-- Private Storage bucket for application documents
-- Paths: <user_id>/<application_id>/<field_key>-<file name>
-- ═════════════════════════════════════════════════════════════════════════
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('application-documents', 'application-documents', false, 10485760,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- True when the caller owns <application_id> and it is still waiting for its form.
create or replace function public.can_upload_application_document(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.applications a
    where a.id::text = (storage.foldername(p_name))[2]
      and a.user_id = auth.uid()
      and a.status = 'Paid'
  ) and (storage.foldername(p_name))[1] = auth.uid()::text;
$$;
revoke all on function public.can_upload_application_document(text) from public, anon;
grant execute on function public.can_upload_application_document(text) to authenticated;

create policy "application docs: upload own while paid"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'application-documents' and public.can_upload_application_document(name));

create policy "application docs: replace own while paid"
  on storage.objects for update to authenticated
  using (bucket_id = 'application-documents' and public.can_upload_application_document(name))
  with check (bucket_id = 'application-documents' and public.can_upload_application_document(name));

create policy "application docs: read own"
  on storage.objects for select to authenticated
  using (bucket_id = 'application-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "application docs: delete own while paid"
  on storage.objects for delete to authenticated
  using (bucket_id = 'application-documents' and public.can_upload_application_document(name));

-- ═════════════════════════════════════════════════════════════════════════
-- AI: essay reviews + free tier of 3 messages a day
-- ═════════════════════════════════════════════════════════════════════════
alter table public.ai_conversations drop constraint ai_conversations_kind_check;
alter table public.ai_conversations add constraint ai_conversations_kind_check check (kind in ('career', 'lesson', 'essay'));
alter table public.ai_usage drop constraint ai_usage_kind_check;
alter table public.ai_usage add constraint ai_usage_kind_check check (kind in ('career', 'lesson', 'essay'));

insert into public.app_settings (key, value) values ('free_ai_daily_limit', '3'::jsonb)
on conflict (key) do update set value = '3'::jsonb;

-- Admin-editable contact settings. Only the public ones are readable by everyone.
insert into public.app_settings (key, value) values
  ('support_whatsapp', '""'::jsonb),
  ('counselor_whatsapp', '""'::jsonb),
  ('counselor_hours', '"Mon–Fri, 9:00–17:00 GMT"'::jsonb)
on conflict (key) do nothing;

drop policy "app_settings: read" on public.app_settings;
create policy "app_settings: read public keys" on public.app_settings for select to anon, authenticated
  using (key in ('free_ai_daily_limit', 'support_whatsapp'));

-- ═════════════════════════════════════════════════════════════════════════
-- Pro-only RPCs (gated by active_plan(), never a boolean)
-- ═════════════════════════════════════════════════════════════════════════
create or replace function public.counselor_contact()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(public.active_plan(), '') <> 'pro' then
    raise exception 'An active Pro plan is required' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'whatsapp', (select value #>> '{}' from public.app_settings where key = 'counselor_whatsapp'),
    'hours', (select value #>> '{}' from public.app_settings where key = 'counselor_hours')
  );
end;
$$;
revoke all on function public.counselor_contact() from public, anon;
grant execute on function public.counselor_contact() to authenticated;

-- Scholarship Matcher: ranks open/upcoming opportunities for the caller with
-- plain-language reasons. Weights: field 40 · level 30 · timing 15 · goal 15.
create or replace function public.scholarship_matches()
returns table (opportunity_id uuid, score integer, reasons text[])
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p public.profiles;
begin
  if coalesce(public.active_plan(), '') <> 'pro' then
    raise exception 'An active Pro plan is required' using errcode = '42501';
  end if;
  select * into p from public.profiles where id = auth.uid();

  return query
  with scored as (
    select o.id,
      (case when cardinality(o.fields) = 0 or p.field_of_interest = any (o.fields) then 40 else 0 end)
      + (case when cardinality(o.levels) = 0 or p.education_level = any (o.levels) then 30 else 0 end)
      + (case o.status when 'open' then 15 when 'rolling' then 15 when 'upcoming' then 8 else 0 end)
      + (case when ('scholarship' = any (p.goals) and o.kind in ('scholarship', 'fellowship'))
                or ('skills' = any (p.goals) and o.kind = 'program')
                or ('career' = any (p.goals) and o.kind in ('program', 'fellowship')) then 15 else 0 end) as s,
      array_remove(array[
        case when cardinality(o.fields) = 0 then 'Open to every field'
             when p.field_of_interest = any (o.fields) then 'Matches your field: ' || p.field_of_interest end,
        case when cardinality(o.levels) = 0 then 'Open at every study level'
             when p.education_level = any (o.levels) then 'Fits your level: ' || p.education_level
             else 'Usually for: ' || array_to_string(o.levels, ', ') end,
        case o.status when 'open' then 'Open now — closes ' || to_char(o.deadline, 'DD Mon YYYY')
                      when 'rolling' then 'Rolling intake — apply any time'
                      when 'upcoming' then coalesce('Opens ' || to_char(o.opens_on, 'DD Mon YYYY'), 'Next round coming') end
      ], null) as r
    from public.opportunities o
    where o.published and o.status <> 'closed'
  )
  select scored.id, least(100, scored.s)::int, scored.r from scored order by scored.s desc;
end;
$$;
revoke all on function public.scholarship_matches() from public, anon;
grant execute on function public.scholarship_matches() to authenticated;

-- ═════════════════════════════════════════════════════════════════════════
-- Revenue: application fees are Afriversity revenue now (one fee, paid to us)
-- ═════════════════════════════════════════════════════════════════════════
drop function public.revenue_summary();
create function public.revenue_summary()
returns table (
  currency                    text,
  subscriptions_revenue       bigint,
  application_fees_collected  bigint,
  mentor_commission           bigint,
  mentor_payouts              bigint,
  net_revenue                 bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with rows as (
    select p.currency, p.amount_cents::bigint as subs, 0::bigint as apps, 0::bigint as comm, 0::bigint as payout
      from public.payments p where p.kind = 'subscription' and p.status = 'success' and p.failure_reason is null
    union all
    select a.currency, 0, (a.app_fee_cents + a.service_fee_cents)::bigint, 0, 0
      from public.applications a where a.status not in ('Pending Payment', 'Failed')
    union all
    select p.currency, 0, 0, p.platform_fee_cents, p.payee_share_cents
      from public.payments p where p.kind = 'mentor' and p.status = 'success' and p.failure_reason is null
  )
  select r.currency, sum(r.subs)::bigint, sum(r.apps)::bigint, sum(r.comm)::bigint, sum(r.payout)::bigint,
         (sum(r.subs) + sum(r.apps) + sum(r.comm))::bigint
  from rows r group by r.currency order by r.currency;
$$;
revoke all on function public.revenue_summary() from public, anon, authenticated;
grant execute on function public.revenue_summary() to service_role;
