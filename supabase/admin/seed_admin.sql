-- Promote an existing account to admin. There is NO admin signup.
--
-- 1. Supabase Dashboard → Authentication → Users → "Add user"
--    (email + strong password, tick "Auto confirm user").
-- 2. Replace the email below and run this in the SQL editor
--    (runs as the database owner, so the role guard allows it).

update public.profiles
set role = 'admin'
where id = (select id from auth.users where email = 'admin@your-domain.com');

-- Verify:
select p.id, u.email, p.role
from public.profiles p
join auth.users u on u.id = p.id
where p.role = 'admin';
