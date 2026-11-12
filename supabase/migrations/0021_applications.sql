-- 0021 — Campus Ambassador and mentor applications.
--   1. Role 'pending_ambassador': a student who has applied to be an ambassador.
--      They keep everything a student has; an admin approves (→ 'ambassador',
--      with a referral code) or rejects (→ back to 'student').
--   2. ambassador_applications: name, university, phone, why. Students apply
--      through apply_ambassador(), the only way a student's role can change
--      (student → pending_ambassador). The role guard (0001) still blocks every
--      other self-service role change.
--   3. mentor_applications: name, expertise, proposed rate, LinkedIn, saved by
--      the signup trigger when someone applies at /mentor-apply. The proposed
--      rate also goes into the existing mentor rate review (0010), so admins
--      approve mentors in Admin → Mentors exactly as before.
-- Safe to re-run.

-- ── 1. Role ──────────────────────────────────────────────────────────────
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('student', 'mentor', 'admin', 'ambassador', 'pending_ambassador'));

-- The role guard lets apply_ambassador() make its one change. The flag is
-- transaction-local and only settable from SQL, never through the API.
create or replace function public.guard_profile_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role is distinct from old.role
     and coalesce(public.request_role(), '') in ('anon', 'authenticated')
     and not public.is_admin()
     and not (
       coalesce(current_setting('afriversity.ambassador_apply', true), '') = 'on'
       and old.role = 'student' and new.role = 'pending_ambassador'
     ) then
    raise exception 'Changing role is not allowed' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- ── 2. Ambassador applications ───────────────────────────────────────────
create table if not exists public.ambassador_applications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  full_name    text not null check (char_length(full_name) between 2 and 120),
  university   text not null check (char_length(university) between 2 and 160),
  phone        text not null check (phone ~ '^\+\d{9,15}$'),
  why          text not null check (char_length(why) between 20 and 1000),
  status       text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by  uuid references public.profiles (id) on delete set null,
  reviewed_at  timestamptz,
  created_at   timestamptz not null default now()
);
-- One open application per student.
create unique index if not exists ambassador_applications_one_pending
  on public.ambassador_applications (user_id) where status = 'pending';
create index if not exists ambassador_applications_status_idx on public.ambassador_applications (status, created_at desc);

alter table public.ambassador_applications enable row level security;
drop policy if exists "ambassador applications: read own" on public.ambassador_applications;
create policy "ambassador applications: read own"
  on public.ambassador_applications for select to authenticated
  using (user_id = (select auth.uid()));
-- Writes only through apply_ambassador() (students) and admin-api (service role).
revoke insert, update, delete on public.ambassador_applications from anon, authenticated;
revoke select on public.ambassador_applications from anon;

create or replace function public.apply_ambassador(p_full_name text, p_university text, p_phone text, p_why text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  my_role text;
  phone text := regexp_replace(coalesce(p_phone, ''), '[\s\-()]', '', 'g');
  app_id uuid;
begin
  if me is null then
    raise exception 'Sign in to apply' using errcode = '42501';
  end if;
  select role into my_role from public.profiles where id = me;
  if my_role = 'ambassador' then
    raise exception 'You are already a Campus Ambassador' using errcode = '23505';
  elsif my_role = 'pending_ambassador' then
    raise exception 'Your application is already being reviewed' using errcode = '23505';
  elsif my_role is distinct from 'student' then
    raise exception 'Only student accounts can apply' using errcode = '42501';
  end if;
  -- Ghana numbers may start with 0.
  if phone ~ '^0\d{9}$' then phone := '+233' || substr(phone, 2); end if;

  insert into public.ambassador_applications (user_id, full_name, university, phone, why)
  values (me, btrim(p_full_name), btrim(p_university), phone, btrim(p_why))
  returning id into app_id;

  perform set_config('afriversity.ambassador_apply', 'on', true);
  update public.profiles set role = 'pending_ambassador' where id = me and role = 'student';
  perform set_config('afriversity.ambassador_apply', '', true);
  return app_id;
end;
$$;
revoke all on function public.apply_ambassador(text, text, text, text) from public, anon;
grant execute on function public.apply_ambassador(text, text, text, text) to authenticated;

-- ── 3. Mentor applications ───────────────────────────────────────────────
create table if not exists public.mentor_applications (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null unique references public.profiles (id) on delete cascade,
  full_name     text not null check (char_length(full_name) between 1 and 120),
  expertise     text not null check (char_length(expertise) <= 300),
  rate_cents    integer check (rate_cents is null or rate_cents between 1000 and 10000000),
  linkedin_url  text check (linkedin_url is null or (linkedin_url ~* '^https://([a-z]{2,3}\.)?linkedin\.com/' and char_length(linkedin_url) <= 300)),
  created_at    timestamptz not null default now()
);
alter table public.mentor_applications enable row level security;
drop policy if exists "mentor applications: read own" on public.mentor_applications;
create policy "mentor applications: read own"
  on public.mentor_applications for select to authenticated
  using (user_id = (select auth.uid()));
revoke insert, update, delete on public.mentor_applications from anon, authenticated;
revoke select on public.mentor_applications from anon;

-- ── Signup trigger: 0018's rules + the mentor application from metadata ──
-- Never fails a signup over the application: bad values are dropped, not raised.
-- (v_ names: plain `expertise` would clash with the mentors.expertise column.)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  wants_mentor boolean := coalesce(meta ->> 'signup_as', '') = 'mentor';
  display text := coalesce(nullif(trim(meta ->> 'full_name'), ''), nullif(trim(meta ->> 'name'), ''));
  code text;
  app jsonb := meta -> 'mentor_application';
  v_expertise text;
  v_rate integer;
  v_linkedin text;
begin
  -- Only students are referred; an unknown code is ignored, never an error.
  if not wants_mentor and public.ambassador_for_code(meta ->> 'referral_code') is not null then
    code := upper(btrim(meta ->> 'referral_code'));
  end if;

  insert into public.profiles (id, email, role, full_name, phone, avatar_url, referred_by)
  values (new.id, new.email, case when wants_mentor then 'mentor' else 'student' end, display, new.phone, meta ->> 'avatar_url', code);

  if wants_mentor then
    insert into public.mentors (id, display_name, status)
    values (new.id, left(coalesce(display, split_part(coalesce(new.email, 'Mentor'), '@', 1)), 120), 'pending');

    if jsonb_typeof(app) = 'object' then
      v_expertise := left(btrim(coalesce(app ->> 'expertise', '')), 300);
      v_rate := case when (app ->> 'rate_cents') ~ '^\d{1,9}$' and (app ->> 'rate_cents')::integer between 1000 and 10000000
                   then (app ->> 'rate_cents')::integer end;
      v_linkedin := case when (app ->> 'linkedin_url') ~* '^https://([a-z]{2,3}\.)?linkedin\.com/' and char_length(app ->> 'linkedin_url') <= 300
                       then btrim(app ->> 'linkedin_url') end;
      insert into public.mentor_applications (user_id, full_name, expertise, rate_cents, linkedin_url)
      values (new.id, left(coalesce(display, 'Mentor'), 120), v_expertise, v_rate, v_linkedin)
      on conflict (user_id) do nothing;
      -- Feed the existing admin review: expertise tags and the proposed rate.
      update public.mentors
         set expertise = coalesce((select array_agg(left(btrim(t), 60)) from unnest(string_to_array(v_expertise, ',')) t where btrim(t) <> ''), '{}'),
             proposed_rate_cents = v_rate,
             rate_review = case when v_rate is null then 'none' else 'pending' end
       where id = new.id;
    end if;
  end if;

  return new;
end;
$$;
