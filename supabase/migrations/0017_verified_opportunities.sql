-- 0017 — Only legitimate, active opportunities reach students.
--   1. opportunities.is_verified: the link goes to the provider's official site
--      (students see a green "Verified" badge). deadline (a date) already exists.
--   2. Scraped opportunities (fetch-scholarships) wait for an admin:
--      review_status 'pending' → 'approved' (published) or 'rejected' (kept so the
--      scraper never imports it again). source_url is the feed article it came
--      from, unique so each article is imported once.
--   3. Every day at midnight (UTC, which is Ghana time) pg_cron unpublishes and
--      closes every opportunity whose deadline has passed. The deadline day itself
--      still counts as open.
-- Needs the pg_cron extension (the create extension line enables it; on Supabase
-- you can also turn it on under Database → Extensions). Safe to re-run.

-- ── 1 + 2. Columns ───────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'opportunities' and column_name = 'is_verified') then
    alter table public.opportunities add column is_verified boolean not null default false;
    -- Everything already in the table was added by an admin from the official link.
    update public.opportunities set is_verified = true;
  end if;
end $$;

alter table public.opportunities
  add column if not exists review_status text not null default 'approved',
  add column if not exists source_url text,
  add column if not exists source_name text;

alter table public.opportunities drop constraint if exists opportunities_review_status_check;
alter table public.opportunities add constraint opportunities_review_status_check
  check (review_status in ('pending', 'approved', 'rejected'));
alter table public.opportunities drop constraint if exists opportunities_source_url_check;
alter table public.opportunities add constraint opportunities_source_url_check
  check (source_url is null or (source_url ~* '^https://' and char_length(source_url) <= 500));
-- Pending and rejected items are never visible to students.
alter table public.opportunities drop constraint if exists opportunities_review_published_check;
alter table public.opportunities add constraint opportunities_review_published_check
  check (review_status = 'approved' or not published);

create unique index if not exists opportunities_source_url_key on public.opportunities (source_url);
create index if not exists opportunities_review_idx on public.opportunities (review_status) where review_status <> 'approved';

-- Students may read the badge (column grants from 0006 list every readable column).
grant select (is_verified) on public.opportunities to anon, authenticated;

-- ── 3. Daily expiry ──────────────────────────────────────────────────────
create or replace function public.expire_opportunities()
returns integer
language sql
security definer
set search_path = ''
as $$
  with expired as (
    update public.opportunities
       set published = false, status = 'closed'
     where deadline < current_date
       and (published or status <> 'closed')
    returning 1
  )
  select count(*)::integer from expired;
$$;
revoke all on function public.expire_opportunities() from public, anon, authenticated;

create extension if not exists pg_cron;
-- Scheduling under the same name replaces the job, so re-running keeps one job.
select cron.schedule('expire-opportunities', '0 0 * * *', 'select public.expire_opportunities()');
