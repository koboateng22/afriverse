-- 0013 — WASSCE results calculator + Pro plan row guarantee.
--   1. public.plans always has the Pro row (GH₵ 10). It used to come only from
--      seed.sql, so a database built from the migrations alone had no plan and
--      paystack-init answered "Pro is not on sale right now".
--   2. profiles.results: the student's WASSCE grades and aggregate. The
--      aggregate is recomputed here from the grades, so the number admins see
--      always matches the grades saved, whatever the client sent.
--   3. universities.cutoff_link: the university's published cut-off points.
--   4. Private Storage bucket results_slips for photos of result slips.
--   5. result_scans: one row per AI scan, for the scan-results daily limit.
-- Safe to re-run.

-- ── 1. Pro plan ──────────────────────────────────────────────────────────
insert into public.plans (code, name, tagline, amount_cents, currency, period_days, ai_daily_limit, features, active)
values ('pro', 'Pro', 'Everything you need to win a place', 1000, 'GHS', 30, null,
        array['Unlimited AI counsellor messages', 'Scholarship Matcher — ranked by how well you fit', 'AI Essay Reviewer',
              'Application Tracker with full timeline', 'Human counsellor on WhatsApp'],
        true)
on conflict (code) do update set active = true;

-- ── 2. profiles.results ──────────────────────────────────────────────────
-- Shape (written by the Result Calculator):
--   { curriculum: 'old' | 'new',
--     core_subjects:     [{ subject, grade }]   exactly 3
--     elective_subjects: [{ subject, grade }]   3–5 (old) or 3–7 (new)
--     aggregate: int, source: 'manual' | 'scan', slip_path?: text, updated_at }
alter table public.profiles add column if not exists results jsonb;

-- A1 = 1 … F9 = 9; null for anything else.
create or replace function public.wassce_grade_points(p_grade text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_grade
    when 'A1' then 1 when 'B2' then 2 when 'B3' then 3
    when 'C4' then 4 when 'C5' then 5 when 'C6' then 6
    when 'D7' then 7 when 'E8' then 8 when 'F9' then 9
  end;
$$;

-- Validates the grades and rebuilds the object, recomputing the aggregate:
--   old curriculum: English + Mathematics + Integrated Science + best 3 electives
--   new curriculum: best 3 core subjects + best 3 electives
-- (both have exactly three cores, so every core counts in either case.)
create or replace function public.normalize_profile_results()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  r jsonb := new.results;
  cur text;
  max_electives integer;
  item jsonb;
  subj text;
  pts integer;
  core_pts integer[] := '{}';
  elective_pts integer[] := '{}';
  cores jsonb := '[]'::jsonb;
  electives jsonb := '[]'::jsonb;
  slip text;
begin
  if r is null or r = 'null'::jsonb then
    new.results := null;
    return new;
  end if;
  if jsonb_typeof(r) <> 'object' then
    raise exception 'results must be an object' using errcode = '23514';
  end if;

  cur := r ->> 'curriculum';
  if cur is null or cur not in ('old', 'new') then
    raise exception 'results.curriculum must be old or new' using errcode = '23514';
  end if;
  if jsonb_typeof(r -> 'core_subjects') is distinct from 'array'
     or jsonb_typeof(r -> 'elective_subjects') is distinct from 'array' then
    raise exception 'results needs core_subjects and elective_subjects lists' using errcode = '23514';
  end if;
  if jsonb_array_length(r -> 'core_subjects') <> 3 then
    raise exception 'Enter a grade for all three core subjects' using errcode = '23514';
  end if;
  max_electives := case cur when 'old' then 5 else 7 end;
  if jsonb_array_length(r -> 'elective_subjects') not between 3 and max_electives then
    raise exception 'Enter between 3 and % elective subjects', max_electives using errcode = '23514';
  end if;

  for item in select value from jsonb_array_elements(r -> 'core_subjects') loop
    subj := btrim(item ->> 'subject');
    pts := public.wassce_grade_points(item ->> 'grade');
    if subj is null or subj = '' or char_length(subj) > 80 or pts is null then
      raise exception 'Each core subject needs a name and a grade from A1 to F9' using errcode = '23514';
    end if;
    core_pts := core_pts || pts;
    cores := cores || jsonb_build_object('subject', subj, 'grade', item ->> 'grade');
  end loop;

  for item in select value from jsonb_array_elements(r -> 'elective_subjects') loop
    subj := btrim(item ->> 'subject');
    pts := public.wassce_grade_points(item ->> 'grade');
    if subj is null or subj = '' or char_length(subj) > 80 or pts is null then
      raise exception 'Each elective needs a name and a grade from A1 to F9' using errcode = '23514';
    end if;
    elective_pts := elective_pts || pts;
    electives := electives || jsonb_build_object('subject', subj, 'grade', item ->> 'grade');
  end loop;

  -- Only the student's own folder in results_slips.
  slip := r ->> 'slip_path';
  if slip is not null and (char_length(slip) > 200 or slip like '%..%' or slip not like (new.id::text || '/%')) then
    raise exception 'results.slip_path is not one of your uploads' using errcode = '23514';
  end if;

  new.results := jsonb_build_object(
    'curriculum', cur,
    'core_subjects', cores,
    'elective_subjects', electives,
    'aggregate',
      (select sum(x) from (select x from unnest(core_pts) as x order by x limit 3) best_cores)
      + (select sum(x) from (select x from unnest(elective_pts) as x order by x limit 3) best_electives),
    'source', case when r ->> 'source' = 'scan' then 'scan' else 'manual' end,
    'updated_at', now()
  ) || case when slip is null then '{}'::jsonb else jsonb_build_object('slip_path', slip) end;
  return new;
end;
$$;

drop trigger if exists profiles_normalize_results on public.profiles;
create trigger profiles_normalize_results
  before insert or update of results on public.profiles
  for each row execute function public.normalize_profile_results();

-- Students save their own results (the "update own" RLS policy limits it to their row).
grant update (results) on public.profiles to authenticated;

-- ── 3. universities.cutoff_link ──────────────────────────────────────────
alter table public.universities add column if not exists cutoff_link text;
alter table public.universities drop constraint if exists universities_cutoff_link_check;
alter table public.universities add constraint universities_cutoff_link_check
  check (cutoff_link is null or (cutoff_link ~* '^https://' and char_length(cutoff_link) <= 500));

-- ── 4. results_slips bucket (private) ────────────────────────────────────
-- Paths: <user_id>/<file name>. Admins read slips through admin-api signed links.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('results_slips', 'results_slips', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "results slips: upload own" on storage.objects;
create policy "results slips: upload own"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'results_slips' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "results slips: replace own" on storage.objects;
create policy "results slips: replace own"
  on storage.objects for update to authenticated
  using (bucket_id = 'results_slips' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'results_slips' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "results slips: read own" on storage.objects;
create policy "results slips: read own"
  on storage.objects for select to authenticated
  using (bucket_id = 'results_slips' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "results slips: delete own" on storage.objects;
create policy "results slips: delete own"
  on storage.objects for delete to authenticated
  using (bucket_id = 'results_slips' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ── 5. result_scans (scan-results daily limit) ───────────────────────────
-- Kept apart from ai_usage so scans never use up the free chat allowance.
create table if not exists public.result_scans (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now()
);
create index if not exists result_scans_user_idx on public.result_scans (user_id, created_at desc);
alter table public.result_scans enable row level security;
-- No policies: only the service role (scan-results) reads or writes it.
revoke all on public.result_scans from anon, authenticated;
