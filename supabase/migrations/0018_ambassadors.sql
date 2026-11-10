-- 0018 — Campus Ambassador referrals ("pending vs. cleared" earnings, manual payouts).
--   1. profiles.role may be 'ambassador': a student with a referral code. The app
--      treats ambassadors as students everywhere, plus the Ambassador Hub. Only an
--      admin (admin-api, service role) can make someone an ambassador.
--   2. profiles.referral_code (unique, e.g. CHRIS10) and profiles.referred_by (the
--      code a student signed up with). Set once, by the signup trigger (email and
--      phone signups send it as metadata) or by claim_referral() (Google signups,
--      within 7 days of joining and before any Pro payment). Never client-writable.
--   3. When a referred student's FIRST Pro subscription becomes active (Paystack
--      has confirmed the money), the ambassador's pending earnings go up by GH₵ 5.
--      referral_rewards keeps one row per referred student, so a student can only
--      ever earn their ambassador one bonus. Renewals earn nothing.
--   4. Ambassadors cannot cash out in the app. An admin pays by MoMo, then
--      ambassador_mark_paid() moves the amount from pending to paid and logs it in
--      ambassador_payouts.
-- Safe to re-run.

-- ── 1. Role ──────────────────────────────────────────────────────────────
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('student', 'mentor', 'admin', 'ambassador'));

-- ── 2. Referral columns ──────────────────────────────────────────────────
alter table public.profiles
  add column if not exists referral_code text,
  add column if not exists referred_by text,
  add column if not exists ambassador_pending_earnings_cents integer not null default 0,
  add column if not exists ambassador_total_paid_cents integer not null default 0;

alter table public.profiles drop constraint if exists profiles_referral_code_check;
alter table public.profiles add constraint profiles_referral_code_check
  check (referral_code is null or referral_code ~ '^[A-Z0-9]{4,16}$');
alter table public.profiles drop constraint if exists profiles_ambassador_money_check;
alter table public.profiles add constraint profiles_ambassador_money_check
  check (ambassador_pending_earnings_cents >= 0 and ambassador_total_paid_cents >= 0);
create unique index if not exists profiles_referral_code_key on public.profiles (referral_code);

-- referred_by follows the code if an admin ever changes it.
alter table public.profiles drop constraint if exists profiles_referred_by_fkey;
alter table public.profiles add constraint profiles_referred_by_fkey
  foreign key (referred_by) references public.profiles (referral_code) on update cascade on delete set null;
create index if not exists profiles_referred_by_idx on public.profiles (referred_by) where referred_by is not null;

-- None of these are in the client update grants (0001/0013), so students can't
-- write them; RLS ("read own") lets each user read their own values.

alter table public.subscriptions add column if not exists referral_code_used text;

-- ── 3. Ledger ────────────────────────────────────────────────────────────
create table if not exists public.referral_rewards (
  id                uuid primary key default gen_random_uuid(),
  ambassador_id     uuid not null references public.profiles (id) on delete cascade,
  referred_user_id  uuid unique references public.profiles (id) on delete set null,
  subscription_id   uuid unique references public.subscriptions (id) on delete set null,
  code              text not null,
  amount_cents      integer not null check (amount_cents > 0),
  created_at        timestamptz not null default now()
);
create index if not exists referral_rewards_ambassador_idx on public.referral_rewards (ambassador_id, created_at desc);

create table if not exists public.ambassador_payouts (
  id             uuid primary key default gen_random_uuid(),
  ambassador_id  uuid not null references public.profiles (id) on delete cascade,
  amount_cents   integer not null check (amount_cents > 0),
  paid_by        uuid references public.profiles (id) on delete set null,
  reference      text check (reference is null or char_length(reference) <= 120),
  created_at     timestamptz not null default now()
);
create index if not exists ambassador_payouts_ambassador_idx on public.ambassador_payouts (ambassador_id, created_at desc);

alter table public.referral_rewards enable row level security;
alter table public.ambassador_payouts enable row level security;
-- No policies: only security-definer functions and the service role touch them.
revoke all on public.referral_rewards, public.ambassador_payouts from anon, authenticated;

-- ── Helpers ──────────────────────────────────────────────────────────────
-- The ambassador behind a code, or null ("chris10 " works the same as "CHRIS10").
create or replace function public.ambassador_for_code(p_code text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id from public.profiles p
   where p.referral_code = upper(btrim(p_code)) and p.role = 'ambassador';
$$;
revoke all on function public.ambassador_for_code(text) from public, anon, authenticated;

-- Signup form check: is this a live ambassador code? (Codes are meant to be shared.)
create or replace function public.referral_code_valid(p_code text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_code is not null and char_length(p_code) <= 32 and public.ambassador_for_code(p_code) is not null;
$$;
revoke all on function public.referral_code_valid(text) from public;
grant execute on function public.referral_code_valid(text) to anon, authenticated;

-- ── Signup trigger: 0011's rules + the referral code from metadata ───────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  wants_mentor boolean := coalesce(new.raw_user_meta_data ->> 'signup_as', '') = 'mentor';
  display text := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'name'), '')
  );
  code text;
begin
  -- Only students are referred; an unknown code is ignored, never an error.
  if not wants_mentor and public.ambassador_for_code(new.raw_user_meta_data ->> 'referral_code') is not null then
    code := upper(btrim(new.raw_user_meta_data ->> 'referral_code'));
  end if;

  insert into public.profiles (id, email, role, full_name, phone, avatar_url, referred_by)
  values (
    new.id,
    new.email,
    case when wants_mentor then 'mentor' else 'student' end,
    display,
    new.phone,
    new.raw_user_meta_data ->> 'avatar_url',
    code
  );

  if wants_mentor then
    insert into public.mentors (id, display_name, status)
    values (new.id, coalesce(display, split_part(coalesce(new.email, 'Mentor'), '@', 1)), 'pending');
  end if;

  return new;
end;
$$;

-- ── Google signups: claim a code after the redirect ──────────────────────
-- Only once, only for a student who joined in the last 7 days and has never
-- had a Pro subscription, and never their own code.
create or replace function public.claim_referral(p_code text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  amb uuid := public.ambassador_for_code(p_code);
begin
  if me is null or amb is null or amb = me then return false; end if;
  update public.profiles p
     set referred_by = upper(btrim(p_code))
   where p.id = me
     and p.role = 'student'
     and p.referred_by is null
     and p.created_at > now() - interval '7 days'
     and not exists (select 1 from public.subscriptions s where s.user_id = me and s.status in ('active', 'expired'));
  return found;
end;
$$;
revoke all on function public.claim_referral(text) from public, anon;
grant execute on function public.claim_referral(text) to authenticated;

-- ── 3. The GH₵ 5 bonus when a referred student first goes Pro ───────────
-- Subscriptions only become 'active' after Paystack confirms the payment
-- (_shared/fulfill.ts: pending → active), so the bonus is never paid for an
-- unpaid checkout.
create or replace function public.credit_referral()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  bonus constant integer := 500; -- GH₵ 5, in pesewas
  code text;
  amb uuid;
begin
  if new.status <> 'active' or old.status = 'active' or new.plan <> 'pro' then
    return new;
  end if;
  select p.referred_by into code from public.profiles p where p.id = new.user_id;
  amb := public.ambassador_for_code(code);
  if amb is null or amb = new.user_id then
    return new;
  end if;

  insert into public.referral_rewards (ambassador_id, referred_user_id, subscription_id, code, amount_cents)
  values (amb, new.user_id, new.id, code, bonus)
  on conflict (referred_user_id) do nothing;
  if found then
    new.referral_code_used := code;
    update public.profiles
       set ambassador_pending_earnings_cents = ambassador_pending_earnings_cents + bonus
     where id = amb;
  end if;
  return new;
end;
$$;
revoke all on function public.credit_referral() from public, anon, authenticated;

drop trigger if exists subscriptions_credit_referral on public.subscriptions;
create trigger subscriptions_credit_referral
  before update of status on public.subscriptions
  for each row execute function public.credit_referral();

-- ── Ambassador Hub numbers (the caller's own) ────────────────────────────
create or replace function public.ambassador_stats()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'referral_code', p.referral_code,
    'signups', (select count(*) from public.profiles r where r.referred_by = p.referral_code),
    'upgrades', (select count(*) from public.referral_rewards w where w.ambassador_id = p.id),
    'pending_cents', p.ambassador_pending_earnings_cents,
    'paid_cents', p.ambassador_total_paid_cents
  )
  from public.profiles p
  where p.id = auth.uid() and p.role = 'ambassador';
$$;
revoke all on function public.ambassador_stats() from public, anon;
grant execute on function public.ambassador_stats() to authenticated;

-- ── 4. Manual payout (admin-api only) ────────────────────────────────────
-- Moves exactly the amount the admin saw and paid. A bonus that lands in the
-- meantime stays pending for the next payout instead of being marked paid.
create or replace function public.ambassador_mark_paid(p_ambassador uuid, p_amount integer, p_admin uuid, p_reference text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated public.profiles%rowtype;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Nothing to pay' using errcode = '22023';
  end if;
  update public.profiles
     set ambassador_pending_earnings_cents = ambassador_pending_earnings_cents - p_amount,
         ambassador_total_paid_cents = ambassador_total_paid_cents + p_amount
   where id = p_ambassador
     and role = 'ambassador'
     and ambassador_pending_earnings_cents >= p_amount
  returning * into updated;
  if not found then
    raise exception 'Pending earnings changed or are lower than that amount. Reload and try again.' using errcode = '40001';
  end if;
  insert into public.ambassador_payouts (ambassador_id, amount_cents, paid_by, reference)
  values (p_ambassador, p_amount, p_admin, nullif(btrim(coalesce(p_reference, '')), ''));
  return jsonb_build_object(
    'pending_cents', updated.ambassador_pending_earnings_cents,
    'paid_cents', updated.ambassador_total_paid_cents
  );
end;
$$;
revoke all on function public.ambassador_mark_paid(uuid, integer, uuid, text) from public, anon, authenticated;
grant execute on function public.ambassador_mark_paid(uuid, integer, uuid, text) to service_role;
