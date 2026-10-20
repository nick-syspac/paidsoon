-- D9 narrow dependency; SOURCE ONLY until separately approved for deployment.
-- Order: reviewed additive CommitGuard migration -> commitguard-constraints.sql
-- -> rls-commitguard-policies.sql -> this file, in an owner transaction.
-- No schema/default ACL, role, trial/billing, or other CashPlan table changes.
-- BEGIN CASHPLAN COMMITGUARD POLICIES
-- Permissive policies OR together. Never silently retain an unknown SELECT,
-- INSERT or ALL policy that can authorize client access around plan ownership.
-- Known names below are replaced even if an older definition used FOR ALL.
DO $cashplan_policy_review$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policy p
    WHERE p.polrelid IN ('public.cash_plans'::regclass,
      'public.cash_plan_overrides'::regclass, 'public.cash_plan_snapshots'::regclass)
      AND p.polcmd IN ('r', 'a', '*')
      AND EXISTS (SELECT 1 FROM unnest(p.polroles) role_id
        WHERE role_id = 0 OR CASE WHEN role_id <> 0 THEN
          pg_has_role('authenticated', role_id, 'MEMBER') OR pg_has_role('anon', role_id, 'MEMBER')
          ELSE false END)
      AND NOT (
        (p.polrelid = 'public.cash_plans'::regclass AND p.polname = 'cashplan select own') OR
        (p.polrelid = 'public.cash_plan_overrides'::regclass AND p.polname IN
          ('cashplan override select own plan', 'cashplan override insert own plan')) OR
        (p.polrelid = 'public.cash_plan_snapshots'::regclass AND p.polname IN
          ('cashplan snapshot select own plan', 'cashplan snapshot insert own plan'))
      )
  ) THEN
    RAISE EXCEPTION 'Unreviewed overlapping CashPlan client policy; review before applying narrow ACL artifact';
  END IF;
END
$cashplan_policy_review$;

ALTER TABLE public.cash_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_plan_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_plan_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.cash_plans, public.cash_plan_overrides,
  public.cash_plan_snapshots FROM PUBLIC, anon, authenticated;
-- Table revocation alone does not remove inherited historical column grants.
DO $cashplan_column_acls$
DECLARE
  target_table text;
  columns_sql text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY['cash_plans', 'cash_plan_overrides', 'cash_plan_snapshots']
  LOOP
    SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum) INTO columns_sql
      FROM pg_attribute WHERE attrelid = format('public.%I', target_table)::regclass
      AND attnum > 0 AND NOT attisdropped;
    EXECUTE format('REVOKE ALL PRIVILEGES (%s) ON TABLE public.%I FROM PUBLIC, anon, authenticated',
      columns_sql, target_table);
  END LOOP;
END
$cashplan_column_acls$;

-- Existing readers and manual-item RETURNING use complete rows. No plan writes,
-- snapshot rewrites/deletes or override reassignment. Prisma emits @default(now())
-- created_at values in INSERT as well as @updatedAt, so both are allowlisted.
GRANT SELECT ON TABLE public.cash_plans, public.cash_plan_overrides,
  public.cash_plan_snapshots TO authenticated;
GRANT INSERT (id, plan_id, entity_type, entity_id, amount_cents, reason, owner,
  effective_from, expires_at, planned_date, source_type, source_id, created_by, created_at, updated_at)
  ON public.cash_plan_overrides TO authenticated;
GRANT INSERT (id, plan_id, scenario_id, input_hash, engine_version, confidence,
  status, lowest_closing_cash_cents, buffer_gap_cents, weeks, input_version,
  anchor_date, input_currency, cash_input_revision, commitment_revision,
  canonical_facts, coverage, input_quality, created_at) ON public.cash_plan_snapshots TO authenticated;

DROP POLICY IF EXISTS "cashplan select own" ON public.cash_plans;
CREATE POLICY "cashplan select own" ON public.cash_plans FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid())::text);
DROP POLICY IF EXISTS "cashplan override select own plan" ON public.cash_plan_overrides;
CREATE POLICY "cashplan override select own plan" ON public.cash_plan_overrides FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.cash_plans p
    WHERE p.id = cash_plan_overrides.plan_id AND p.user_id = (SELECT auth.uid())::text));
DROP POLICY IF EXISTS "cashplan override insert own plan" ON public.cash_plan_overrides;
CREATE POLICY "cashplan override insert own plan" ON public.cash_plan_overrides FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.cash_plans p
    WHERE p.id = cash_plan_overrides.plan_id AND p.user_id = (SELECT auth.uid())::text));
DROP POLICY IF EXISTS "cashplan snapshot select own plan" ON public.cash_plan_snapshots;
CREATE POLICY "cashplan snapshot select own plan" ON public.cash_plan_snapshots FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.cash_plans p
    WHERE p.id = cash_plan_snapshots.plan_id AND p.user_id = (SELECT auth.uid())::text));
DROP POLICY IF EXISTS "cashplan snapshot insert own plan" ON public.cash_plan_snapshots;
CREATE POLICY "cashplan snapshot insert own plan" ON public.cash_plan_snapshots FOR INSERT TO authenticated
  WITH CHECK (scenario_id IS NULL AND EXISTS (SELECT 1 FROM public.cash_plans p
    WHERE p.id = cash_plan_snapshots.plan_id AND p.user_id = (SELECT auth.uid())::text));
-- END CASHPLAN COMMITGUARD POLICIES