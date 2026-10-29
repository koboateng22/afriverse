-- 0003 — Public catalogue: opportunities, universities (with fees), careers,
-- courses + lessons. Readable by everyone signed in; writable only by admin
-- (Session 4 does admin writes through service-role edge functions).

-- ── opportunities ────────────────────────────────────────────────────────
create table public.opportunities (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  title         text not null,
  provider      text not null,
  kind          text not null check (kind in ('scholarship', 'fellowship', 'program', 'award')),
  summary       text not null,
  description   text not null,
  eligibility   text[] not null default '{}',
  benefits      text[] not null default '{}',
  fields        text[] not null default '{}',   -- matches profiles.field_of_interest values
  levels        text[] not null default '{}',   -- matches profiles.education_level values
  host_country  text not null,                  -- where the study/programme happens
  open_to       text not null default 'All African countries',
  funding       text not null check (funding in ('full', 'partial', 'stipend', 'free_training', 'prize')),
  -- Cycle state. 'open' + deadline drives the countdown; 'upcoming' uses opens_on.
  status        text not null check (status in ('open', 'rolling', 'upcoming', 'closed')),
  deadline      date,
  opens_on      date,
  cycle_note    text,
  url           text not null check (url ~ '^https://'),
  is_pro        boolean not null default false,  -- detail section blurred for non-Pro (Session 2)
  featured      boolean not null default false,
  published     boolean not null default true,
  verified_on   date not null default current_date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint open_has_deadline check (status <> 'open' or deadline is not null)
);

create index opportunities_status_deadline_idx on public.opportunities (status, deadline);
create index opportunities_fields_idx on public.opportunities using gin (fields);

create trigger opportunities_set_updated_at
  before update on public.opportunities
  for each row execute function public.set_updated_at();

-- ── universities (fees live here — never hard-coded in the app) ──────────
create table public.universities (
  id                 uuid primary key default gen_random_uuid(),
  slug               text not null unique,
  name               text not null,
  short_name         text,
  country            text not null,
  city               text not null,
  currency           text not null check (currency in ('GHS', 'NGN', 'USD', 'KES', 'ZAR')),
  -- Smallest currency unit (pesewas / kobo). Never divided on the server.
  app_fee_cents      integer not null check (app_fee_cents >= 0),
  service_fee_cents  integer not null check (service_fee_cents >= 0),
  fee_notes          text,
  website            text check (website is null or website ~ '^https://'),
  active             boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create trigger universities_set_updated_at
  before update on public.universities
  for each row execute function public.set_updated_at();

-- ── careers (Career Compass fallback + cards, Session 2) ─────────────────
create table public.careers (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  title       text not null,
  field       text not null,
  summary     text not null,
  day_to_day  text[] not null default '{}',
  core_skills text[] not null default '{}',
  pathways    text[] not null default '{}',
  created_at  timestamptz not null default now()
);

-- ── courses + lessons (YouTube micro-courses, Session 2) ─────────────────
create table public.courses (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  title       text not null,
  field       text not null,
  summary     text not null,
  level       text not null default 'Beginner' check (level in ('Beginner', 'Intermediate', 'Advanced')),
  published   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger courses_set_updated_at
  before update on public.courses
  for each row execute function public.set_updated_at();

create table public.course_lessons (
  id               uuid primary key default gen_random_uuid(),
  course_id        uuid not null references public.courses (id) on delete cascade,
  position         smallint not null check (position > 0),
  title            text not null,
  youtube_id       text not null check (youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  channel          text,
  summary          text,
  created_at       timestamptz not null default now(),
  unique (course_id, position)
);

-- ── RLS ──────────────────────────────────────────────────────────────────
alter table public.opportunities  enable row level security;
alter table public.universities   enable row level security;
alter table public.careers        enable row level security;
alter table public.courses        enable row level security;
alter table public.course_lessons enable row level security;

-- Opportunities are also shown on the public landing page, so anon can read published rows.
create policy "opportunities: read published"
  on public.opportunities for select to anon, authenticated
  using (published);
create policy "opportunities: admin all"
  on public.opportunities for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "universities: read active"
  on public.universities for select to authenticated
  using (active);
create policy "universities: admin all"
  on public.universities for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "careers: read"
  on public.careers for select to authenticated
  using (true);
create policy "careers: admin all"
  on public.careers for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "courses: read published"
  on public.courses for select to authenticated
  using (published);
create policy "courses: admin all"
  on public.courses for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "course_lessons: read when course published"
  on public.course_lessons for select to authenticated
  using (exists (select 1 from public.courses c where c.id = course_id and c.published));
create policy "course_lessons: admin all"
  on public.course_lessons for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
