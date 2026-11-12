-- 0020 — Admins upload university logos and cover photos themselves.
-- The university_assets bucket (0015) was written only by scrape-university
-- (service role). These policies let a signed-in ADMIN upload, replace and
-- remove files there from the admin console. Students and anonymous visitors
-- still cannot write; the bucket stays publicly readable through its URLs.
-- Bucket limits from 0015 still apply: 5 MB, PNG/JPEG/WebP/GIF/AVIF/ICO, no SVG.
-- Safe to re-run.

drop policy if exists "university assets: admin upload" on storage.objects;
create policy "university assets: admin upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'university_assets' and (select public.is_admin()));

drop policy if exists "university assets: admin replace" on storage.objects;
create policy "university assets: admin replace"
  on storage.objects for update to authenticated
  using (bucket_id = 'university_assets' and (select public.is_admin()))
  with check (bucket_id = 'university_assets' and (select public.is_admin()));

drop policy if exists "university assets: admin delete" on storage.objects;
create policy "university assets: admin delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'university_assets' and (select public.is_admin()));

-- Storage's upload checks also read the object row, so admins can select their bucket's objects.
drop policy if exists "university assets: admin read" on storage.objects;
create policy "university assets: admin read"
  on storage.objects for select to authenticated
  using (bucket_id = 'university_assets' and (select public.is_admin()));
