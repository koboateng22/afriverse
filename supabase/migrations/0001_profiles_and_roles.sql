-- 0001 — Profiles, roles and the role helpers every RLS policy uses.
-- Roles: student | mentor | admin. Admin is NEVER assignable from the client:
-- the signup trigger only ever creates student or (pending) mentor profiles,
-- and a guard trigger blocks role changes made by end users.

create extension if not exists pgcrypto;

-- ── Shared helpers ───────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Role of the caller's JWT ('anon' | 'authenticated' | 'service_role' | null
-- when running as a database owner, e.g. the SQL editor or migrations).
create or replace function public.request_role()
returns text
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
$$;

-- ── profiles ─────────────────────────────────────────────────────────────
create table public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  role              text not null default 'student' check (role in ('student', 'mentor', 'admin')),
  full_name         text check (char_length(full_name) <= 120),
  phone             text check (char_length(phone) <= 32),
  country           text check (char_length(country) <= 80),
  education_level   text check (char_length(education_level) <= 60),
  field_of_interest text check (char_length(field_of_interest) <= 60),
  interests         text[] not null default '{}',
  goals             text[] not null default '{}',
  bio               text check (char_length(bio) <= 600),
  avatar_url        text,
  onboarded_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index profiles_role_idx on public.profiles (role);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- SECURITY DEFINER so policies can read the caller's role without recursing
-- through the profiles RLS policies.
create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

revoke all on function public.current_app_role() from public;
revoke all on function public.is_admin() from public;
grant execute on function public.current_app_role() to anon, authenticated, service_role;
grant execute on function public.is_admin() to anon, authenticated, service_role;

-- End users may never change their own role (or anyone's) unless they are admin.
-- Service-role requests and direct SQL (seeding the admin) are allowed.
create or replace function public.guard_profile_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role is distinct from old.role
     and coalesce(public.request_role(), '') in ('anon', 'authenticated')
     and not public.is_admin() then
    raise exception 'Changing role is not allowed' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger profiles_guard_role
  before update on public.profiles
  for each row execute function public.guard_profile_role();

alter table public.profiles enable row level security;

create policy "profiles: read own"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

create policy "profiles: admin reads all"
  on public.profiles for select to authenticated
  using ((select public.is_admin()));

create policy "profiles: update own"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "profiles: admin updates all"
  on public.profiles for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- No insert/delete policies: rows are created by the auth trigger (0002)
-- and removed by the FK cascade when the auth user is deleted.

-- Column privileges: signed-in users can only ever write their own
-- self-service columns. `role` is not writable from the client at all
-- (admin changes go through service-role edge functions in Session 4);
-- the guard trigger above is a second line of defence.
revoke insert, update, delete on public.profiles from anon, authenticated;
revoke select on public.profiles from anon;
grant update (full_name, phone, country, education_level, field_of_interest,
              interests, goals, bio, avatar_url, onboarded_at)
  on public.profiles to authenticated;
