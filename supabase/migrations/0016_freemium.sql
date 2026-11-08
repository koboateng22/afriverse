-- 0016 — Freemium: the AI is free for everyone; Pro (GH₵ 40 a month) is human support.
--   1. Pro costs GH₵ 40 (4000 pesewas). paystack-init charges this row. Clearing
--      paystack_plan_code makes it create a new Paystack plan at the new amount on
--      the next card checkout; students already on the old Paystack plan keep
--      renewing at their old price until they change plan.
--   2. Pro's feature list leads with human support and no longer mentions AI.
--   3. One daily AI allowance for every student (Free and Pro), high enough that
--      it only stops spam: app_settings.free_ai_daily_limit, at least 50.
--   4. The University Concierge service fee: new universities start at GH₵ 50
--      (universities.service_fee_cents). Existing universities keep theirs.
-- Run after 0012 and 0013 (both of which set the old GH₵ 10 price). Safe to re-run.

-- ── 1 + 2. Pro plan ──────────────────────────────────────────────────────
update public.plans
   set paystack_plan_code = null
 where code = 'pro'
   and amount_cents is distinct from 4000;

update public.plans
   set amount_cents = 4000,
       currency = 'GHS',
       tagline = 'A real counsellor in your corner',
       ai_daily_limit = null,
       features = array[
         'Direct WhatsApp access to a Human Counselor',
         'CV & Essay Strategy Sessions',
         'Priority Support',
         'Scholarship Matcher — ranked by how well you fit',
         'Application Tracker with full timeline',
         'Insider application guides'
       ]
 where code = 'pro';

-- ── 3. AI allowance (same for every plan) ────────────────────────────────
insert into public.app_settings (key, value) values ('free_ai_daily_limit', '50'::jsonb)
on conflict (key) do update
  set value = '50'::jsonb
  where (public.app_settings.value #>> '{}')::numeric < 50;

-- ── 4. Concierge service fee ─────────────────────────────────────────────
alter table public.universities alter column service_fee_cents set default 5000;
