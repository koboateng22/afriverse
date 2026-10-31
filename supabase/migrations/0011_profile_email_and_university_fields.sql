-- 0011 — profiles.email + the signup trigger that fills it, and a guarantee
-- that public.universities has every column the admin console and AI read.
-- Safe to re-run; columns that already exist are left untouched.

-- ── profiles.email ───────────────────────────────────────────────────────
-- Readable under the existing profiles RLS (own row + admins). Not in the
-- authenticated column grants, so it can't be edited from the client. It is a
-- copy taken at signup: auth.users stays the source of truth for login.
-- Phone-only accounts have no email, so this stays nullable.
alter table public.profiles add column if not exists email text;

update public.profiles p
   set email = u.email
  from auth.users u
 where u.id = p.id
   and p.email is distinct from u.email;

-- Accounts created while the trigger was missing get the default student role.
insert into public.profiles (id, email, role)
select u.id, u.email, 'student'
  from auth.users u
 where not exists (select 1 from public.profiles p where p.id = u.id);

-- ── Signup trigger ───────────────────────────────────────────────────────
-- Same rules as 0002 (role comes ONLY from this whitelist; 'admin' in metadata
-- is ignored; mentor signups also get a pending mentors row), plus email.
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
  insert into public.profiles (id, email, role, full_name, phone, avatar_url)
  values (
    new.id,
    new.email,
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── universities ─────────────────────────────────────────────────────────
alter table public.universities
  add column if not exists description text,
  add column if not exists fee_notes text,
  add column if not exists service_fee_cents integer not null default 0,
  add column if not exists currency text not null default 'GHS';

-- app_fee_cents remains the column paystack-init charges and admins edit. This
-- mirrors it, so the two names can never disagree about what a student pays.
alter table public.universities
  add column if not exists application_fee_cents integer generated always as (app_fee_cents) stored;
