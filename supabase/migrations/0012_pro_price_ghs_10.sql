-- 0012 — Pro drops to GHS 10 a month (1000 pesewas).
-- paystack-init charges this row. Clearing paystack_plan_code makes it create a
-- new Paystack plan at the new amount on the next card checkout; students already
-- on the old Paystack plan keep renewing at their old price until they change plan.
update public.plans
   set amount_cents = 1000,
       currency = 'GHS',
       paystack_plan_code = null
 where code = 'pro'
   and amount_cents is distinct from 1000;
