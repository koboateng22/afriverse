-- 0004 — Tables that record money: applications, mentor_sessions, payments,
-- subscriptions. Clients can only READ their own rows. Every insert/update
-- comes from the Paystack edge functions using the service role (Session 3),
-- so a browser can never mark something as paid.

-- ── applications (university concierge) ─────────────────────────────────
create table public.applications (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles (id) on delete cascade,
  university_id      uuid not null references public.universities (id) on delete restrict,
  program            text not null,
  intake             text,
  status             text not null default 'Pending Payment'
                     check (status in ('Pending Payment', 'Submitted', 'In Review', 'Offer', 'Rejected', 'Withdrawn', 'Failed')),
  -- Fee snapshot at payment time: later admin fee edits never touch these.
  currency           text not null,
  app_fee_cents      integer not null check (app_fee_cents >= 0),
  service_fee_cents  integer not null check (service_fee_cents >= 0),
  total_cents        integer generated always as (app_fee_cents + service_fee_cents) stored,
  payment_ref        text unique,
  details            jsonb not null default '{}'::jsonb,
  status_note        text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index applications_user_idx on public.applications (user_id, created_at desc);
create trigger applications_set_updated_at
  before update on public.applications
  for each row execute function public.set_updated_at();

-- ── mentor_sessions ──────────────────────────────────────────────────────
create table public.mentor_sessions (
  id            uuid primary key default gen_random_uuid(),
  mentor_id     uuid not null references public.mentors (id) on delete restrict,
  student_id    uuid not null references public.profiles (id) on delete cascade,
  scheduled_at  timestamptz not null,
  duration_min  smallint not null default 45 check (duration_min between 15 and 180),
  topic         text,
  status        text not null default 'pending'
                check (status in ('pending', 'confirmed', 'completed', 'cancelled', 'failed')),
  currency      text not null,
  amount_cents  integer not null check (amount_cents >= 0),
  payment_ref   text unique,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index mentor_sessions_mentor_idx on public.mentor_sessions (mentor_id, scheduled_at);
create index mentor_sessions_student_idx on public.mentor_sessions (student_id, scheduled_at);
create trigger mentor_sessions_set_updated_at
  before update on public.mentor_sessions
  for each row execute function public.set_updated_at();

-- ── payments (ledger of every Paystack charge) ───────────────────────────
create table public.payments (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles (id) on delete cascade,
  kind                text not null check (kind in ('subscription', 'application', 'mentor')),
  reference           text not null unique,
  status              text not null default 'pending' check (status in ('pending', 'success', 'failed')),
  currency            text not null,
  amount_cents        integer not null check (amount_cents >= 0),
  -- Mentor split (75/25) and concierge service fee, recorded for the revenue dashboard.
  platform_fee_cents  integer not null default 0 check (platform_fee_cents >= 0),
  payee_share_cents   integer not null default 0 check (payee_share_cents >= 0),
  channel             text,
  related_id          uuid,
  raw_event           jsonb,
  paid_at             timestamptz,
  created_at          timestamptz not null default now()
);
create index payments_user_idx on public.payments (user_id, created_at desc);

-- ── subscriptions (manual monthly renewal; expires_at model) ─────────────
create table public.subscriptions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  plan            text not null check (plan in ('plus', 'pro')),
  status          text not null default 'pending' check (status in ('pending', 'active', 'expired', 'failed')),
  currency        text not null,
  amount_cents    integer not null check (amount_cents >= 0),
  payment_ref     text unique,
  starts_at       timestamptz,
  expires_at      timestamptz,
  reminded_3d_at  timestamptz,
  reminded_1d_at  timestamptz,
  created_at      timestamptz not null default now(),
  constraint active_has_window check (status <> 'active' or (starts_at is not null and expires_at > starts_at))
);
create index subscriptions_user_active_idx on public.subscriptions (user_id, expires_at desc) where status = 'active';

-- ── RLS: owner reads, admin reads, nobody writes from the client ─────────
alter table public.applications    enable row level security;
alter table public.mentor_sessions enable row level security;
alter table public.payments        enable row level security;
alter table public.subscriptions   enable row level security;

create policy "applications: read own" on public.applications for select to authenticated
  using (user_id = (select auth.uid()));
create policy "applications: admin reads all" on public.applications for select to authenticated
  using ((select public.is_admin()));

create policy "mentor_sessions: student reads own" on public.mentor_sessions for select to authenticated
  using (student_id = (select auth.uid()));
create policy "mentor_sessions: mentor reads own" on public.mentor_sessions for select to authenticated
  using (mentor_id = (select auth.uid()));
create policy "mentor_sessions: admin reads all" on public.mentor_sessions for select to authenticated
  using ((select public.is_admin()));

create policy "payments: read own" on public.payments for select to authenticated
  using (user_id = (select auth.uid()));
create policy "payments: admin reads all" on public.payments for select to authenticated
  using ((select public.is_admin()));

create policy "subscriptions: read own" on public.subscriptions for select to authenticated
  using (user_id = (select auth.uid()));
create policy "subscriptions: admin reads all" on public.subscriptions for select to authenticated
  using ((select public.is_admin()));

-- Belt and braces: even if a permissive policy is added later by mistake,
-- the client roles hold no write privilege on money tables.
revoke insert, update, delete on public.applications, public.mentor_sessions,
  public.payments, public.subscriptions from anon, authenticated;
revoke select on public.applications, public.mentor_sessions,
  public.payments, public.subscriptions from anon;
