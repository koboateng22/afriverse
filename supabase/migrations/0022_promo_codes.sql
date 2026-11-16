-- 0022 — Promo codes for Pro, and Pro at GH₵ 35.
--   1. Pro costs GH₵ 35 (3500 pesewas). As in 0016, clearing paystack_plan_code makes
--      paystack-init create a Paystack plan at the new price on the next card checkout;
--      students already on an older Paystack plan keep renewing at their old price.
--   2. promo_codes: a code takes a percentage off Pro (WAITLIST20 = 20% off → GH₵ 28).
--      paystack-init re-checks the code and prices the charge; the browser never does.
--      Card checkouts with a code subscribe to a Paystack plan at the discounted price
--      (Paystack charges a plan's own amount), so card renewals stay discounted.
--   3. subscriptions.promo_code_used records the code on each checkout; Admin → Promo
--      codes counts paid uses from it.
-- Run after 0021. Safe to re-run.

-- ── 1. Pro price ─────────────────────────────────────────────────────────
update public.plans
   set paystack_plan_code = null
 where code = 'pro'
   and amount_cents is distinct from 3500;

update public.plans
   set amount_cents = 3500
 where code = 'pro';

-- ── 2. Promo codes ───────────────────────────────────────────────────────
create table if not exists public.promo_codes (
  id                   uuid primary key default gen_random_uuid(),
  -- Stored in capitals; students can type any case.
  code                 text not null unique check (code ~ '^[A-Z0-9_-]{3,32}$'),
  -- Up to 90%: a 100% code would need a checkout that skips Paystack entirely.
  discount_percentage  integer not null check (discount_percentage between 1 and 90),
  is_active            boolean not null default true,
  created_at           timestamptz not null default now(),
  -- The discounted Paystack plan for card checkouts, created on first use and
  -- re-created whenever the discounted amount changes (new Pro price or new %).
  paystack_plan_code   text,
  paystack_plan_amount integer
);

-- No client policies: the list of codes is private. Students check one code at a
-- time through promo_code_discount(); admins manage codes through admin-api.
alter table public.promo_codes enable row level security;
revoke all on public.promo_codes from anon, authenticated;

insert into public.promo_codes (code, discount_percentage)
values ('WAITLIST20', 20)
on conflict (code) do nothing;

/** The discount for an active code, or null. Case and spaces don't matter. */
create or replace function public.promo_code_discount(p_code text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select discount_percentage
    from public.promo_codes
   where code = upper(btrim(coalesce(p_code, '')))
     and is_active;
$$;
revoke all on function public.promo_code_discount(text) from public;
grant execute on function public.promo_code_discount(text) to authenticated;

-- ── 3. Usage ─────────────────────────────────────────────────────────────
alter table public.subscriptions
  add column if not exists promo_code_used text
  references public.promo_codes (code) on update cascade on delete set null;

create index if not exists subscriptions_promo_code_used_idx
  on public.subscriptions (promo_code_used)
  where promo_code_used is not null;

/** Paid checkouts per code (active or expired subscriptions). For admin-api only. */
create or replace function public.promo_code_uses()
returns table (code text, uses bigint)
language sql
stable
security definer
set search_path = public
as $$
  select s.promo_code_used, count(*)
    from public.subscriptions s
   where s.promo_code_used is not null
     and s.status in ('active', 'expired')
   group by s.promo_code_used;
$$;
revoke all on function public.promo_code_uses() from public, anon, authenticated;
grant execute on function public.promo_code_uses() to service_role;
