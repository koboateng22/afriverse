-- 0024 — Pay-as-you-go alongside Pro, and the AI CV Builder.
--
--   1. one_time_products: CV download GH₵ 10 (1000 pesewas), VIP Essay Review GH₵ 15 (1500).
--      paystack-init prices every purchase from this table; the browser never sends a price.
--   2. purchases: one row per one-time checkout (pending → paid | failed). A paid
--      cv_download unlocks one CV; a paid essay_review is one human review on WhatsApp.
--      payments.kind gains 'purchase' so the ledger and fulfilment cover them.
--   3. cvs: CVs written by the cv-builder function. Students read, edit (the Markdown and
--      the target role) and delete their own; only the function creates them.
--   4. The "first free human review": profiles.free_review_claimed_at, set once by
--      claim_free_review(). counselor_status() tells the app what the student can use and
--      reveals the counsellor's WhatsApp only to students who may message it.
--   5. ai_usage counts CV generations (kind 'cv') for the daily limit.
--   6. community_size() for the paywall's social proof (a real count, never a made-up one).
--   7. Pro's feature list leads with "AI CV Builder for Scholarships & Jobs".
--   8. The University Concierge service fee becomes GH₵ 20 (2000 pesewas). The app always
--      shows each university's real fee, so an admin can still change one later.
--   9. revenue_summary() includes one-time purchases.
--
-- Additive and safe to re-run: no table, column, user or payment is dropped or changed
-- except the service fee and the Pro feature list (both by request).

-- ── 1. Products ───────────────────────────────────────────────────────────
create table if not exists public.one_time_products (
  code          text primary key check (code in ('cv_download', 'essay_review')),
  name          text not null,
  amount_cents  integer not null check (amount_cents > 0),
  currency      text not null default 'GHS' check (currency = 'GHS'),
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);
insert into public.one_time_products (code, name, amount_cents) values
  ('cv_download',  'Professional CV download (PDF)', 1000),
  ('essay_review', 'VIP Essay Review by a human counsellor', 1500)
on conflict (code) do nothing;

alter table public.one_time_products enable row level security;
drop policy if exists "one_time_products: read" on public.one_time_products;
create policy "one_time_products: read" on public.one_time_products for select to authenticated using (true);
revoke insert, update, delete on public.one_time_products from anon, authenticated;
grant select on public.one_time_products to authenticated;

-- ── 3. CVs (before purchases, which reference them) ──────────────────────
create table if not exists public.cvs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  target_role   text not null check (char_length(target_role) between 2 and 80),
  details       jsonb not null default '{}'::jsonb,
  markdown      text not null default '' check (char_length(markdown) <= 20000),
  generated_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists cvs_user_idx on public.cvs (user_id, updated_at desc);
drop trigger if exists cvs_updated_at on public.cvs;
create trigger cvs_updated_at before update on public.cvs
  for each row execute function public.set_updated_at();

alter table public.cvs enable row level security;
drop policy if exists "cvs: read own" on public.cvs;
create policy "cvs: read own" on public.cvs for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "cvs: edit own" on public.cvs;
create policy "cvs: edit own" on public.cvs for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "cvs: delete own" on public.cvs;
create policy "cvs: delete own" on public.cvs for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.cvs from anon;
revoke insert, update on public.cvs from authenticated;
grant select, delete on public.cvs to authenticated;
grant update (markdown, target_role) on public.cvs to authenticated; -- the "Edit" button

-- ── 2. Purchases + the ledger ─────────────────────────────────────────────
create table if not exists public.purchases (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  product       text not null references public.one_time_products (code),
  status        text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  currency      text not null default 'GHS' check (currency = 'GHS'),
  amount_cents  integer not null check (amount_cents > 0),
  payment_ref   text unique,
  cv_id         uuid references public.cvs (id) on delete set null,
  used_at       timestamptz,
  paid_at       timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists purchases_user_idx on public.purchases (user_id, created_at desc);
create index if not exists purchases_cv_idx on public.purchases (cv_id) where status = 'paid';

alter table public.purchases enable row level security;
drop policy if exists "purchases: read own" on public.purchases;
create policy "purchases: read own" on public.purchases for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "purchases: admin reads all" on public.purchases;
create policy "purchases: admin reads all" on public.purchases for select to authenticated using ((select public.is_admin()));
revoke insert, update, delete on public.purchases from anon, authenticated;
grant select on public.purchases to authenticated;

alter table public.payments drop constraint if exists payments_kind_check;
alter table public.payments add constraint payments_kind_check
  check (kind in ('subscription', 'application', 'mentor', 'purchase'));

-- ── CV unlock: Pro, or a paid cv_download for this CV ─────────────────────
create or replace function public.cv_unlocked(p_cv uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.cvs c
    where c.id = p_cv
      and c.user_id = auth.uid()
      and (
        coalesce(public.active_plan(), '') = 'pro'
        or exists (select 1 from public.purchases p
                   where p.cv_id = c.id and p.user_id = c.user_id
                     and p.product = 'cv_download' and p.status = 'paid')
      )
  );
$$;
revoke all on function public.cv_unlocked(uuid) from public, anon;
grant execute on function public.cv_unlocked(uuid) to authenticated;

-- ── 4. The first free human review ────────────────────────────────────────
-- Not in the profile column grant: only claim_free_review() can set it.
alter table public.profiles add column if not exists free_review_claimed_at timestamptz;

insert into public.app_settings (key, value) values ('counselor_whatsapp', '""'::jsonb)
on conflict (key) do nothing;

/** What the WhatsApp Counsellor page may offer this student. */
create or replace function public.counselor_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  is_pro boolean := coalesce(public.active_plan(), '') = 'pro';
  claimed timestamptz;
  paid_reviews integer;
  may_message boolean;
begin
  if me is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  select p.free_review_claimed_at into claimed from public.profiles p where p.id = me;
  select count(*) into paid_reviews from public.purchases pu
    where pu.user_id = me and pu.product = 'essay_review' and pu.status = 'paid';
  -- The number goes only to students who may use it: Pro, a free review still to
  -- claim, or a paid review.
  may_message := is_pro or claimed is null or paid_reviews > 0;
  return jsonb_build_object(
    'pro', is_pro,
    'free_review_claimed_at', claimed,
    'paid_reviews', paid_reviews,
    'whatsapp', case when may_message then (select value #>> '{}' from public.app_settings where key = 'counselor_whatsapp') end,
    'hours', (select value #>> '{}' from public.app_settings where key = 'counselor_hours')
  );
end;
$$;
revoke all on function public.counselor_status() from public, anon;
grant execute on function public.counselor_status() to authenticated;

/** Uses the student's one free human review. Returns the WhatsApp number to message. */
create or replace function public.claim_free_review()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  claimed timestamptz;
begin
  if me is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  update public.profiles set free_review_claimed_at = now()
    where id = me and free_review_claimed_at is null
    returning free_review_claimed_at into claimed;
  if claimed is null then
    raise exception 'You have already used your free review' using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'whatsapp', (select value #>> '{}' from public.app_settings where key = 'counselor_whatsapp'),
    'claimed_at', claimed
  );
end;
$$;
revoke all on function public.claim_free_review() from public, anon;
grant execute on function public.claim_free_review() to authenticated;

-- ── 5. CV generations count toward a daily AI limit ──────────────────────
alter table public.ai_usage drop constraint if exists ai_usage_kind_check;
alter table public.ai_usage add constraint ai_usage_kind_check check (kind in ('career', 'lesson', 'essay', 'cv'));

-- ── 6. Social proof: how many students use Afriversity ───────────────────
create or replace function public.community_size()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.profiles where role = 'student';
$$;
revoke all on function public.community_size() from public, anon;
grant execute on function public.community_size() to authenticated;

-- ── 7. Pro leads with the CV Builder ──────────────────────────────────────
update public.plans
   set features = array_prepend('AI CV Builder for Scholarships & Jobs', coalesce(features, '{}'))
 where code = 'pro'
   and not ('AI CV Builder for Scholarships & Jobs' = any (coalesce(features, '{}')));

-- ── 8. Concierge: GH₵ 20 service fee ──────────────────────────────────────
update public.universities set service_fee_cents = 2000 where service_fee_cents is distinct from 2000;

-- ── 9. Revenue includes one-time purchases ────────────────────────────────
drop function if exists public.revenue_summary();
create function public.revenue_summary()
returns table (
  currency                    text,
  subscriptions_revenue       bigint,
  application_fees_collected  bigint,
  mentor_commission           bigint,
  mentor_payouts              bigint,
  net_revenue                 bigint,
  one_time_purchases          bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with rows as (
    select p.currency, p.amount_cents::bigint as subs, 0::bigint as apps, 0::bigint as comm, 0::bigint as payout, 0::bigint as once
      from public.payments p where p.kind = 'subscription' and p.status = 'success' and p.failure_reason is null
    union all
    select a.currency, 0, (a.app_fee_cents + a.service_fee_cents)::bigint, 0, 0, 0
      from public.applications a where a.status not in ('Pending Payment', 'Failed')
    union all
    select p.currency, 0, 0, p.platform_fee_cents, p.payee_share_cents, 0
      from public.payments p where p.kind = 'mentor' and p.status = 'success' and p.failure_reason is null
    union all
    select p.currency, 0, 0, 0, 0, p.amount_cents::bigint
      from public.payments p where p.kind = 'purchase' and p.status = 'success' and p.failure_reason is null
  )
  select r.currency, sum(r.subs)::bigint, sum(r.apps)::bigint, sum(r.comm)::bigint, sum(r.payout)::bigint,
         (sum(r.subs) + sum(r.apps) + sum(r.comm) + sum(r.once))::bigint, sum(r.once)::bigint
  from rows r group by r.currency order by r.currency;
$$;
revoke all on function public.revenue_summary() from public, anon, authenticated;
grant execute on function public.revenue_summary() to service_role;
