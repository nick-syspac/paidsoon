-- Task 1.4: targeted CommitGuard-only ACL/RLS deployment artifact.
-- Order: reviewed additive Prisma migration -> commitguard-constraints.sql ->
-- this file. Execute atomically as the schema owner. Do not apply the complete
-- canonical rls-policies.sql to activate unrelated pending trial/billing ACLs.
-- No local auth schema/role scaffolding belongs in deployable SQL.
-- BEGIN COMMITGUARD CASH PROTECTION POLICIES
ALTER TABLE public.commit_guard_cash_contexts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commitment_coverages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commit_guard_work_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commit_guard_evaluation_states ENABLE ROW LEVEL SECURITY;

-- Table revocation alone does not revoke pre-existing column grants. Reset both
-- layers, on ONLY these four new tables, before granting explicit allowlists.
REVOKE ALL PRIVILEGES ON TABLE public.commit_guard_cash_contexts,
  public.commitment_coverages, public.commit_guard_work_items,
  public.commit_guard_evaluation_states FROM PUBLIC, anon, authenticated;
DO $commitguard_column_acls$
DECLARE
  target_table text;
  columns_sql text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY['commit_guard_cash_contexts',
    'commitment_coverages', 'commit_guard_work_items', 'commit_guard_evaluation_states']
  LOOP
    SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum) INTO columns_sql
    FROM pg_attribute
    WHERE attrelid = format('public.%I', target_table)::regclass
      AND attnum > 0 AND NOT attisdropped;
    EXECUTE format('REVOKE ALL PRIVILEGES (%s) ON TABLE public.%I FROM PUBLIC, anon, authenticated',
      columns_sql, target_table);
  END LOOP;
END
$commitguard_column_acls$;

GRANT SELECT ON TABLE public.commit_guard_cash_contexts TO authenticated;
GRANT INSERT (id, user_id, amount_cents, currency, balance_as_of,
  weekly_operating_expenses_cents, weekly_expenses_currency, weekly_expenses_as_of,
  tax_protection_currency, revision, updated_at)
  ON public.commit_guard_cash_contexts TO authenticated;
GRANT UPDATE (amount_cents, currency, balance_as_of, weekly_operating_expenses_cents,
  weekly_expenses_currency, weekly_expenses_as_of, tax_protection_currency,
  revision, updated_at) ON public.commit_guard_cash_contexts TO authenticated;

GRANT SELECT, DELETE ON TABLE public.commitment_coverages TO authenticated;
GRANT INSERT (id, user_id, commitment_id, occurrence_date, currency, covered_cents,
  target_kind, imported_bill_id, tax_reserve_category_id, updated_at)
  ON public.commitment_coverages TO authenticated;
GRANT UPDATE (commitment_id, occurrence_date, currency, covered_cents, target_kind,
  imported_bill_id, tax_reserve_category_id, updated_at)
  ON public.commitment_coverages TO authenticated;

-- Explicit selections only: SELECT * / RETURNING * must fail for tenant work.
-- Source/dedupe identity, lease metadata, fences and retry history stay internal.
GRANT SELECT (id, kind, state, attempts, requested_at, completed_at, safe_error_code,
  created_at, updated_at) ON public.commit_guard_work_items TO authenticated;
-- Prisma supplies id and @updatedAt; all scheduling/lifecycle fields use DB defaults.
GRANT INSERT (id, user_id, kind, dedupe_key, source_kind, source_id,
  calculation_revision, updated_at) ON public.commit_guard_work_items TO authenticated;
GRANT SELECT ON TABLE public.commit_guard_evaluation_states TO authenticated;

DROP POLICY IF EXISTS "commitguard cash select own" ON public.commit_guard_cash_contexts;
CREATE POLICY "commitguard cash select own" ON public.commit_guard_cash_contexts
  FOR SELECT TO authenticated USING ((SELECT auth.uid())::text = user_id);
DROP POLICY IF EXISTS "commitguard cash insert own" ON public.commit_guard_cash_contexts;
CREATE POLICY "commitguard cash insert own" ON public.commit_guard_cash_contexts
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid())::text = user_id);
DROP POLICY IF EXISTS "commitguard cash update own" ON public.commit_guard_cash_contexts;
CREATE POLICY "commitguard cash update own" ON public.commit_guard_cash_contexts
  FOR UPDATE TO authenticated USING ((SELECT auth.uid())::text = user_id)
  WITH CHECK ((SELECT auth.uid())::text = user_id);

DROP POLICY IF EXISTS "commitguard coverage select own" ON public.commitment_coverages;
CREATE POLICY "commitguard coverage select own" ON public.commitment_coverages
  FOR SELECT TO authenticated USING ((SELECT auth.uid())::text = user_id);
DROP POLICY IF EXISTS "commitguard coverage insert own" ON public.commitment_coverages;
CREATE POLICY "commitguard coverage insert own" ON public.commitment_coverages
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid())::text = user_id);
DROP POLICY IF EXISTS "commitguard coverage update own" ON public.commitment_coverages;
CREATE POLICY "commitguard coverage update own" ON public.commitment_coverages
  FOR UPDATE TO authenticated USING ((SELECT auth.uid())::text = user_id)
  WITH CHECK ((SELECT auth.uid())::text = user_id);
-- D4 requires explicit tenant-scoped removal before deleting referenced rows.
DROP POLICY IF EXISTS "commitguard coverage delete own" ON public.commitment_coverages;
CREATE POLICY "commitguard coverage delete own" ON public.commitment_coverages
  FOR DELETE TO authenticated USING ((SELECT auth.uid())::text = user_id);

DROP POLICY IF EXISTS "commitguard work select own" ON public.commit_guard_work_items;
CREATE POLICY "commitguard work select own" ON public.commit_guard_work_items
  FOR SELECT TO authenticated USING ((SELECT auth.uid())::text = user_id);
DROP POLICY IF EXISTS "commitguard work insert pending own" ON public.commit_guard_work_items;
CREATE POLICY "commitguard work insert pending own" ON public.commit_guard_work_items
  FOR INSERT TO authenticated WITH CHECK (
    (SELECT auth.uid())::text = user_id AND state = 'pending'
    AND attempts = 0 AND fence = 0 AND generation = 0
    AND lease_owner IS NULL AND lease_expires_at IS NULL AND completed_at IS NULL
    AND safe_error_code IS NULL AND attempt_history IS NULL
    -- D7 daily identity namespace is executor-only. A tenant request must not
    -- reserve a forged daily key and suppress canonical scheduler work.
    AND source_kind <> 'daily' AND dedupe_key NOT LIKE 'daily:%'
  );
-- No tenant UPDATE/DELETE policies or grants: the trusted executor owns lifecycle.
-- Initial request shape belongs here, not in role/time-dependent table CHECKs;
-- trusted retries must retain their counters/history and remain legal.
DROP POLICY IF EXISTS "commitguard evaluation select own" ON public.commit_guard_evaluation_states;
CREATE POLICY "commitguard evaluation select own" ON public.commit_guard_evaluation_states
  FOR SELECT TO authenticated USING ((SELECT auth.uid())::text = user_id);
-- Evaluation writes are system-only; no tenant INSERT/UPDATE/DELETE policies/grants.
-- END COMMITGUARD CASH PROTECTION POLICIES