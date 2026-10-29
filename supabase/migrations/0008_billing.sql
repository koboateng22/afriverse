-- 0008 — Plans, the active_plan() helper, Pro gating, payment bookkeeping
-- and mentor-session helpers. Subscription expiry is enforced here, by time,
-- not by a boolean flag: a row only counts while now() < expires_at.

-- ── plans (prices live in the DB, read by paystack-init) ────────────────
create table public.plans (
  code            text primary key check (code in ('plus', 'pro')),
  name            text not null,
  tagline         text not null,
  amount_cents    integer not null check (amount_cents > 0),
  currency        text not null check (currency in ('GHS', 'NGN', 'USD', 'KES', 'ZAR')),
  period_days     smallint not null default 30 check (period_days between 1 and 366),
  ai_daily_limit  integer not null check (ai_daily_limit > 0),
  features        text[] not null default '{}',
  active          boolean not null default true,
  updated_at      timestamptz not null default now()
);
create trigger plans_set_updated_at before update on public.plans
  for each row execute function public.set_updated_at();

alter table public.plans enable row level security;
create policy "plans: read active" on public.plans for select to anon, authenticated using (active);
revoke insert, update, delete on public.plans from anon, authenticated;

-- Free-tier AI limit lives beside the plans so admins can see it in one place.
create table public.app_settings (
  key    text primary key,
  value  jsonb not null
);
alter table public.app_settings enable row level security;
create policy "app_settings: read" on public.app_settings for select to anon, authenticated using (true);
revoke insert, update, delete on public.app_settings from anon, authenticated;

-- ── active_plan(): the ONLY way the app decides Plus/Pro access ─────────
-- Callers may only ask about themselves; the service role and admins may ask
-- about anyone (edge functions pass the user id explicitly).
create or replace function public.active_plan(p_user uuid default null)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select s.plan
  from public.subscriptions s
  where s.user_id = coalesce(p_user, auth.uid())
    and (
      p_user is null
      or p_user = auth.uid()
      or coalesce(public.request_role(), 'owner') in ('service_role', 'owner')
      or public.is_admin()
    )
    and s.status = 'active'
    and s.starts_at <= now()
    and s.expires_at > now()
  order by case s.plan when 'pro' then 0 else 1 end, s.expires_at desc
  limit 1;
$$;
revoke all on function public.active_plan(uuid) from public;
grant execute on function public.active_plan(uuid) to authenticated, service_role;

-- Pro-only content: returns the insider guide only while a Pro plan is active.
create or replace function public.opportunity_pro_insights(p_opportunity uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(public.active_plan(), '') <> 'pro' then
    raise exception 'An active Pro plan is required' using errcode = '42501';
  end if;
  return (select o.pro_insights from public.opportunities o where o.id = p_opportunity and o.published);
end;
$$;
revoke all on function public.opportunity_pro_insights(uuid) from public;
grant execute on function public.opportunity_pro_insights(uuid) to authenticated;

-- ── payments bookkeeping ─────────────────────────────────────────────────
alter table public.payments
  add column metadata        jsonb not null default '{}'::jsonb,
  add column failure_reason  text,
  add column updated_at      timestamptz not null default now();
create trigger payments_set_updated_at before update on public.payments
  for each row execute function public.set_updated_at();
create index payments_status_idx on public.payments (status, kind);

-- ── mentors: availability note + slot protection ─────────────────────────
alter table public.mentors add column availability text check (char_length(availability) <= 200);
grant select (availability) on public.mentors to authenticated;
grant update (availability) on public.mentors to authenticated;

-- A mentor can never hold two paid bookings for the same start time.
create unique index mentor_sessions_paid_slot_uq
  on public.mentor_sessions (mentor_id, scheduled_at)
  where status in ('confirmed', 'completed');

-- Mentors mark their own confirmed sessions as completed once they've started.
create or replace function public.mentor_complete_session(p_session uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.mentor_sessions
     set status = 'completed'
   where id = p_session
     and mentor_id = auth.uid()
     and status = 'confirmed'
     and scheduled_at <= now();
  if not found then
    raise exception 'Session not found, not yours, or not started yet' using errcode = '42501';
  end if;
end;
$$;
revoke all on function public.mentor_complete_session(uuid) from public;
grant execute on function public.mentor_complete_session(uuid) to authenticated;

-- Students see the mentor's display name on their bookings; mentors see the
-- student's name on theirs. Exposed through a narrow function, not by
-- widening the profiles policy.
create or replace function public.session_counterparts()
returns table (session_id uuid, mentor_name text, student_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, m.display_name, coalesce(p.full_name, 'Student')
  from public.mentor_sessions s
  join public.mentors m on m.id = s.mentor_id
  join public.profiles p on p.id = s.student_id
  where s.student_id = auth.uid() or s.mentor_id = auth.uid();
$$;
revoke all on function public.session_counterparts() from public;
grant execute on function public.session_counterparts() to authenticated;
