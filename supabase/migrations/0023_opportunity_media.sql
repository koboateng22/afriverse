-- 0023 — Home feed variety: internships, and a cover image per opportunity.
--   1. opportunities.kind accepts 'internship' (admins pick it; fetch-scholarships
--      files internship posts under it instead of 'program').
--   2. opportunities.cover_image_url (optional, https): shown at the top of the card.
--      Without one the card shows a soft gradient in its category colour.
-- Run after 0022. Safe to re-run.

alter table public.opportunities drop constraint if exists opportunities_kind_check;
alter table public.opportunities
  add constraint opportunities_kind_check
  check (kind in ('scholarship', 'fellowship', 'program', 'award', 'internship'));

alter table public.opportunities add column if not exists cover_image_url text;
alter table public.opportunities drop constraint if exists opportunities_cover_image_https;
alter table public.opportunities
  add constraint opportunities_cover_image_https
  check (cover_image_url is null or cover_image_url ~ '^https://');

-- Opportunities are read through column grants (0006, 0017): add the new column.
grant select (cover_image_url) on public.opportunities to anon, authenticated;
