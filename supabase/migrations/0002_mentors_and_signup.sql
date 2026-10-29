-- 0002 — Mentors + the signup trigger that creates profiles.
-- A mentor signs up through /mentor/login with metadata signup_as = 'mentor'.
-- That gives them role = 'mentor' and a mentors row with status = 'pending';
-- they get nothing public until an admin approves them (Session 4).

create table public.mentors (
  id               uuid primary key references public.profiles (id) on delete cascade,
  display_name     text not null check (char_length(display_name) between 1 and 120),
  headline         text check (char_length(headline) <= 140),
  bio              text check (char_length(bio) <= 1200),
  expertise        text[] not null default '{}',
  country          text,
  rate_cents       integer check (rate_cents is null or rate_cents >= 0),
  currency         text not null default 'GHS' check (currency in ('GHS', 'NGN', 'USD', 'KES', 'ZAR')),
  status           text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  -- Paystack subaccount (percentage_charge = 25) — set by admin in Session 4.
  subaccount_code  text,
  approved_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index mentors_status_idx on public.mentors (status);

create trigger mentors_set_updated_at
  before update on public.mentors
  for each row execute function public.set_updated_at();

-- Mentors can edit their own public profile but not their approval status
-- or payout wiring.
create or replace function public.guard_mentor_admin_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(public.request_role(), '') in ('anon', 'authenticated') and not public.is_admin() then
    if new.status is distinct from old.status
       or new.subaccount_code is distinct from old.subaccount_code
       or new.approved_at is distinct from old.approved_at then
      raise exception 'Only an admin can change mentor approval or payout fields' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger mentors_guard_admin_fields
  before update on public.mentors
  for each row execute function public.guard_mentor_admin_fields();

alter table public.mentors enable row level security;

create policy "mentors: anyone signed in reads approved"
  on public.mentors for select to authenticated
  using (status = 'approved');

create policy "mentors: read own"
  on public.mentors for select to authenticated
  using (id = (select auth.uid()));

create policy "mentors: update own"
  on public.mentors for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "mentors: admin all"
  on public.mentors for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- Column privileges: the Paystack subaccount code is never readable from
-- the browser (paystack-init reads it with the service role), and mentors
-- can only edit their public-profile columns.
revoke all on public.mentors from anon, authenticated;
grant select (id, display_name, headline, bio, expertise, country, rate_cents,
              currency, status, approved_at, created_at, updated_at)
  on public.mentors to authenticated;
grant update (display_name, headline, bio, expertise, country, rate_cents, currency)
  on public.mentors to authenticated;

-- ── Signup trigger ───────────────────────────────────────────────────────
-- Runs for email, Google and phone signups alike. Role comes ONLY from the
-- whitelist below; 'admin' in metadata is ignored.
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
begin
  insert into public.profiles (id, role, full_name, phone, avatar_url)
  values (
    new.id,
    case when wants_mentor then 'mentor' else 'student' end,
    display,
    new.phone,
    new.raw_user_meta_data ->> 'avatar_url'
  );

  if wants_mentor then
    insert into public.mentors (id, display_name, status)
    values (new.id, coalesce(display, split_part(coalesce(new.email, 'Mentor'), '@', 1)), 'pending');
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
