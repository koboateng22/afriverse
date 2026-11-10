-- 0019 — Public vs private universities, and the details students compare.
--   1. universities.ownership: 'public' | 'private', or NULL = not verified yet.
--      NULL is shown to admins as "Needs review" and to students under
--      "Classification being verified" — never guessed from a name.
--      ownership_source records how it was verified (official site, regulator list…).
--   2. programmes, admission_requirements, tuition_info: optional details shown on
--      the university pages when an admin has filled them in.
--   3. The five universities from seed.sql are classified, matched on slug AND
--      official domain so a different university that reused a slug is left alone.
--      Their ownership is documented (and stated in their own descriptions);
--      every other row stays NULL until an admin verifies it.
-- Existing rows are otherwise untouched. Safe to re-run.

alter table public.universities
  add column if not exists ownership text,
  add column if not exists ownership_source text,
  add column if not exists programmes text[] not null default '{}',
  add column if not exists admission_requirements text,
  add column if not exists tuition_info text;

alter table public.universities drop constraint if exists universities_ownership_check;
alter table public.universities add constraint universities_ownership_check
  check (ownership is null or ownership in ('public', 'private'));
alter table public.universities drop constraint if exists universities_details_check;
alter table public.universities add constraint universities_details_check
  check (
    (ownership_source is null or char_length(ownership_source) <= 300)
    and (admission_requirements is null or char_length(admission_requirements) <= 2000)
    and (tuition_info is null or char_length(tuition_info) <= 800)
    and coalesce(array_length(programmes, 1), 0) <= 60
  );

create index if not exists universities_ownership_idx on public.universities (ownership);

-- ── Seeded universities with documented ownership ───────────────────────
update public.universities
   set ownership = 'public', ownership_source = 'Public university founded in 1948 (official site: ug.edu.gh)'
 where ownership is null and slug = 'university-of-ghana' and website ilike '%ug.edu.gh%';
update public.universities
   set ownership = 'public', ownership_source = 'Public university founded in 1952 (official site: knust.edu.gh)'
 where ownership is null and slug = 'knust' and website ilike '%knust.edu.gh%';
update public.universities
   set ownership = 'public', ownership_source = 'Federal (public) university founded in 1962 (official site: unilag.edu.ng)'
 where ownership is null and slug = 'university-of-lagos' and website ilike '%unilag.edu.ng%';
update public.universities
   set ownership = 'private', ownership_source = 'Private university founded in 2002 (official site: covenantuniversity.edu.ng)'
 where ownership is null and slug = 'covenant-university' and website ilike '%covenantuniversity.edu.ng%';
update public.universities
   set ownership = 'private', ownership_source = 'Private university founded in 2002 (official site: ashesi.edu.gh)'
 where ownership is null and slug = 'ashesi-university' and website ilike '%ashesi.edu.gh%';
