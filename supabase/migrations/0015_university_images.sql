-- 0015 — University logo + cover image (admin "Auto-Fill from Website").
--   1. universities.logo_url / cover_image_url (https only).
--   2. Public Storage bucket university_assets. scrape-university copies each
--      image here (service role), so a university redesigning its site never
--      breaks our pictures. No client policies: nobody but the service role
--      writes, and public buckets are readable through their public URLs.
-- Safe to re-run.

alter table public.universities
  add column if not exists logo_url text,
  add column if not exists cover_image_url text;

alter table public.universities drop constraint if exists universities_logo_url_check;
alter table public.universities add constraint universities_logo_url_check
  check (logo_url is null or (logo_url ~* '^https://' and char_length(logo_url) <= 500));
alter table public.universities drop constraint if exists universities_cover_image_url_check;
alter table public.universities add constraint universities_cover_image_url_check
  check (cover_image_url is null or (cover_image_url ~* '^https://' and char_length(cover_image_url) <= 500));

-- Paths: <website host>/<logo|cover>-<content hash>.<ext>. No SVG: it can carry script.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('university_assets', 'university_assets', true, 5242880,
        array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif', 'image/x-icon'])
on conflict (id) do update
  set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
