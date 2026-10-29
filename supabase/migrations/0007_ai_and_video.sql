-- 0007 — Server-side caches and usage counters for the Gemini + YouTube
-- edge functions. Clients never touch these tables directly.

-- YouTube search results cached for 24h to protect the API quota.
create table public.youtube_cache (
  query_key   text primary key,
  results     jsonb not null,
  fetched_at  timestamptz not null default now()
);
alter table public.youtube_cache enable row level security;
-- No policies: only the service role (edge functions) can read/write.
revoke all on public.youtube_cache from anon, authenticated;

-- One row per AI message sent, used for per-plan daily limits.
create table public.ai_usage (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  kind        text not null check (kind in ('career', 'lesson')),
  created_at  timestamptz not null default now()
);
create index ai_usage_user_day_idx on public.ai_usage (user_id, created_at desc);
alter table public.ai_usage enable row level security;
create policy "ai_usage: read own" on public.ai_usage for select to authenticated
  using (user_id = (select auth.uid()));
revoke insert, update, delete on public.ai_usage from anon, authenticated;
revoke select on public.ai_usage from anon;
