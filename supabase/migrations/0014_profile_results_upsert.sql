-- 0014 — Let the Result Calculator save with upsert.
-- The client sends .upsert({ id, results }, { onConflict: 'id' }), which
-- PostgREST runs as
--   insert into profiles (id, results) … on conflict (id)
--   do update set id = excluded.id, results = excluded.results
-- so the signed-in user needs INSERT and UPDATE on exactly those two columns,
-- plus an insert policy. Every grant is limited to the user's own row by RLS:
--   insert: with check id = auth.uid()          (0014, below)
--   update: using/with check id = auth.uid()    ("profiles: update own", 0001)
-- so "set id = excluded.id" can only ever write the same id back. role, email
-- and the other columns stay unwritable. Requires 0013 (the results column and
-- its validation trigger). Safe to re-run.

grant insert (id, results) on public.profiles to authenticated;
grant update (id, results) on public.profiles to authenticated;

drop policy if exists "profiles: insert own" on public.profiles;
create policy "profiles: insert own"
  on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));
