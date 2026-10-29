-- 0005 — AI conversation history (Career Compass + lesson Q&A, Session 2).
-- Users fully own their own conversations; nobody else (except admin) reads them.

create table public.ai_conversations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind        text not null check (kind in ('career', 'lesson')),
  lesson_id   uuid references public.course_lessons (id) on delete cascade,
  title       text,
  messages    jsonb not null default '[]'::jsonb check (jsonb_typeof(messages) = 'array'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint lesson_kind_has_lesson check (kind <> 'lesson' or lesson_id is not null)
);
create index ai_conversations_user_idx on public.ai_conversations (user_id, updated_at desc);
create trigger ai_conversations_set_updated_at
  before update on public.ai_conversations
  for each row execute function public.set_updated_at();

alter table public.ai_conversations enable row level security;

create policy "ai_conversations: read own" on public.ai_conversations for select to authenticated
  using (user_id = (select auth.uid()));
create policy "ai_conversations: insert own" on public.ai_conversations for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "ai_conversations: update own" on public.ai_conversations for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "ai_conversations: delete own" on public.ai_conversations for delete to authenticated
  using (user_id = (select auth.uid()));
create policy "ai_conversations: admin reads all" on public.ai_conversations for select to authenticated
  using ((select public.is_admin()));

revoke all on public.ai_conversations from anon;
