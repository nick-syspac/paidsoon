-- Task 3.9 offline review artifact: UNAPPLIED; no live enforcement proof.
-- Full deployment only AFTER every billing/onboarding writer is converted.
-- Apply the full tenant-trial-access-policies.sql first, then this block after
-- the journal migration and separate CHECK SQL in a controlled reviewed rollout.
-- Revoke creation defaults BEFORE creating journals; do not expose intermediate
-- tables. The canonical adapter's migration creator is postgres; review other
-- creator roles separately. Defaults affect future public tables, not old ACLs.
-- No transaction wrapper: the reviewed deployer/staged verifier owns it.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;

ALTER TABLE public.tenant_billing_mutations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_billing_mutation_steps ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.tenant_billing_mutations,
  public.tenant_billing_mutation_steps FROM PUBLIC, anon, authenticated;

-- Table revocation does not clear historical column grants. These journals and
-- their immutable request/evidence columns have NO client-readable projection.
DO $$
DECLARE
  journal text;
  columns text;
BEGIN
  FOREACH journal IN ARRAY ARRAY['tenant_billing_mutations', 'tenant_billing_mutation_steps']
  LOOP
    SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum) INTO columns
      FROM pg_attribute WHERE attrelid = format('public.%I', journal)::regclass
        AND attnum > 0 AND NOT attisdropped;
    EXECUTE format('REVOKE SELECT (%s), INSERT (%s), UPDATE (%s), REFERENCES (%s) ON TABLE public.%I FROM PUBLIC, anon, authenticated',
      columns, columns, columns, columns, journal);
  END LOOP;
END
$$;

-- No journal policies or customer grants: deny-by-default RLS plus ACL denial.
-- Status/recovery will use authenticated, scoped server projections (pending).
-- A table UPDATE grant overrides a column revoke, so remove it explicitly too.
REVOKE UPDATE ON TABLE public.user_profiles FROM PUBLIC, anon, authenticated;
REVOKE INSERT (pending_billing_mutation_id), UPDATE (pending_billing_mutation_id)
  ON TABLE public.user_profiles FROM PUBLIC, anon, authenticated;
GRANT UPDATE (display_name, onboarding_completed_at, "updatedAt")
  ON TABLE public.user_profiles TO authenticated;