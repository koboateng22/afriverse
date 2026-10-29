-- 0006 — Saved opportunities + Pro-only "insider guide" content.

-- ── saved_opportunities ─────────────────────────────────────────────────
create table public.saved_opportunities (
  user_id         uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  opportunity_id  uuid not null references public.opportunities (id) on delete cascade,
  created_at      timestamptz not null default now(),
  primary key (user_id, opportunity_id)
);
create index saved_opportunities_user_idx on public.saved_opportunities (user_id, created_at desc);

alter table public.saved_opportunities enable row level security;

create policy "saved: read own" on public.saved_opportunities for select to authenticated
  using (user_id = (select auth.uid()));
create policy "saved: insert own" on public.saved_opportunities for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "saved: delete own" on public.saved_opportunities for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.saved_opportunities from anon;
revoke update on public.saved_opportunities from authenticated;

-- ── Pro insider guides ──────────────────────────────────────────────────
-- Stored on the opportunity but NOT selectable by clients. Pro members get
-- it through opportunity_pro_insights() (0008), which checks active_plan().
alter table public.opportunities add column pro_insights text[] not null default '{}';

revoke select on public.opportunities from anon, authenticated;
grant select (id, slug, title, provider, kind, summary, description, eligibility, benefits,
              fields, levels, host_country, open_to, funding, status, deadline, opens_on,
              cycle_note, url, is_pro, featured, published, verified_on, created_at, updated_at)
  on public.opportunities to anon, authenticated;
