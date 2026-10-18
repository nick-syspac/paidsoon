-- Task 3.8 supplemental CHECKs that Prisma schema/migrate diff cannot express.
-- Offline review artifact only: UNAPPLIED; no live enforcement proof.
-- Apply after the generated add_tenant_billing_mutation_journal migration,
-- first in an explicitly isolated reviewed target. Shared application requires
-- separate authorization and task-3.9 journal RLS/grants/column protection.
-- Do not edit generated/historical migrations to insert these statements.
-- No backfill, reservation release, or automatic repair of invalid rows.
BEGIN;

ALTER TABLE public.tenant_billing_mutations
  ADD CONSTRAINT tenant_billing_mutations_actor_matches_tenant_check
  CHECK (actor_user_id = user_id);

ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_billing_reservations_exclusive_check
  CHECK (pending_trial_operation_id IS NULL OR pending_billing_mutation_id IS NULL);

COMMIT;