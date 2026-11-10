-- Which of supabase/migrations/0001 … 0018 are in this database?
-- Checks for something each migration creates, so it works however the
-- migration was applied (SQL Editor paste or `supabase db push`).
-- Read-only. Run it with scripts/check-migrations.sh, or paste it into the
-- Supabase SQL Editor.
with col as (
  select table_name || '.' || column_name as c
  from information_schema.columns
  where table_schema = 'public'
)
select migration, case when applied then 'yes' else 'MISSING' end as applied, checks
from (values
  ('0001_profiles_and_roles',      to_regclass('public.profiles') is not null,            'table profiles'),
  ('0002_mentors_and_signup',      to_regclass('public.mentors') is not null,             'table mentors'),
  ('0003_catalog',                 to_regclass('public.universities') is not null,        'table universities'),
  ('0004_money_tables',            to_regclass('public.payments') is not null,            'table payments'),
  ('0005_ai_conversations',        to_regclass('public.ai_conversations') is not null,    'table ai_conversations'),
  ('0006_saved_and_pro_content',   to_regclass('public.saved_opportunities') is not null, 'table saved_opportunities'),
  ('0007_ai_and_video',            to_regclass('public.ai_usage') is not null,            'table ai_usage'),
  ('0008_billing',                 to_regclass('public.plans') is not null,               'table plans'),
  ('0009_admin_reporting',         to_regprocedure('public.revenue_summary()') is not null, 'function revenue_summary()'),
  ('0010_pro_ghs_forms_rates',     exists (select 1 from col where c = 'plans.paystack_plan_code')
                                   and exists (select 1 from storage.buckets where id = 'application-documents'),
                                   'plans.paystack_plan_code + bucket application-documents'),
  ('0011_profile_email_and_university_fields',
                                   exists (select 1 from col where c = 'profiles.email')
                                   and exists (select 1 from col where c = 'universities.application_fee_cents'),
                                   'profiles.email + universities.application_fee_cents'),
  -- 0013 also sets this price, so "yes" here can come from either one. 0016 later
  -- replaces it with GHS 40, so once 0016 is in, 0012 no longer needs to show.
  ('0012_pro_price_ghs_10',        case when to_regclass('public.plans') is null then false
                                        else (xpath('/row/n/text()', query_to_xml(
                                          'select count(*) as n from public.plans where code = ''pro'' and amount_cents = 1000 and currency = ''GHS''',
                                          false, true, '')))[1]::text::int > 0 end
                                   or exists (select 1 from information_schema.columns
                                              where table_schema = 'public' and table_name = 'universities'
                                                and column_name = 'service_fee_cents' and column_default like '5000%'),
                                   'Pro plan row at GHS 10 (or superseded by 0016)'),
  ('0013_wassce_results',          exists (select 1 from col where c = 'profiles.results')
                                   and exists (select 1 from col where c = 'universities.cutoff_link')
                                   and exists (select 1 from pg_trigger where tgname = 'profiles_normalize_results')
                                   and exists (select 1 from storage.buckets where id = 'results_slips')
                                   and to_regclass('public.result_scans') is not null
                                   and case when exists (select 1 from col where c = 'profiles.results')
                                            then has_column_privilege('authenticated', 'public.profiles', 'results', 'UPDATE')
                                            else false end,
                                   'profiles.results + its trigger and grant, cutoff_link, bucket results_slips, result_scans'),
  ('0014_profile_results_upsert',  exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles: insert own')
                                   and case when exists (select 1 from col where c = 'profiles.results')
                                            then has_column_privilege('authenticated', 'public.profiles', 'results', 'INSERT')
                                            else false end,
                                   'policy "profiles: insert own" + insert grant on results'),
  ('0015_university_images',       exists (select 1 from col where c = 'universities.logo_url')
                                   and exists (select 1 from col where c = 'universities.cover_image_url')
                                   and exists (select 1 from storage.buckets where id = 'university_assets'),
                                   'universities.logo_url/cover_image_url + bucket university_assets'),
  ('0016_freemium',                exists (select 1 from information_schema.columns
                                           where table_schema = 'public' and table_name = 'universities'
                                             and column_name = 'service_fee_cents' and column_default like '5000%'),
                                   'service fee default GHS 50 (Pro price: see Admin → Plans)'),
  ('0017_verified_opportunities',  exists (select 1 from col where c = 'opportunities.is_verified')
                                   and exists (select 1 from col where c = 'opportunities.review_status')
                                   and to_regprocedure('public.expire_opportunities()') is not null
                                   and case when to_regclass('cron.job') is null then false
                                            else (xpath('/row/n/text()', query_to_xml(
                                              'select count(*) as n from cron.job where jobname = ''expire-opportunities''',
                                              false, true, '')))[1]::text::int > 0 end,
                                   'is_verified, review_status, expire_opportunities() + its pg_cron job'),
  ('0018_ambassadors',             exists (select 1 from col where c = 'profiles.referral_code')
                                   and exists (select 1 from col where c = 'subscriptions.referral_code_used')
                                   and to_regclass('public.referral_rewards') is not null
                                   and exists (select 1 from pg_trigger where tgname = 'subscriptions_credit_referral')
                                   and to_regprocedure('public.ambassador_mark_paid(uuid, integer, uuid, text)') is not null,
                                   'referral columns, rewards ledger, bonus trigger, mark-paid function')
) as m(migration, applied, checks)
order by migration;
