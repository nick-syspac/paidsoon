-- OpenSpec fix-commitguard-cash-protection-workflows, task 1.3 only.
-- Supplemental row CHECKs, not Prisma migration history or an RLS/grant script.
-- Application order on a separately authorized target:
--   1. Review/apply the generated
--      20261018111014_fix_commitguard_cash_protection_workflows migration.
--   2. Apply this entire transaction once; existing invalid rows fail validation.
--   3. Apply ONLY the separately reviewed CommitGuard RLS/column grants (task 1.4).
-- Do not apply the full canonical RLS or unrelated trial/billing SQL as a shortcut.
-- This artifact is verified only on the isolated socket scratch DB, not shared DBs.
-- No backfill, automatic repair, trigger, function, ACL, or unrelated schema change.
--
-- D1: PostgreSQL INTEGER already enforces signed Prisma Int cents/revision bounds
-- (-2147483648..2147483647). Cash may be zero/negative; expense basis may be zero.
-- These NULL-safe groups distinguish an absent input from explicit zero. Currencies
-- are independently attested: do not require equality or relabel saved amounts.
-- Future-date/freshness validation uses an injected UTC clock in task 2.1, not a
-- time-dependent CHECK whose result would change after insertion.
-- D4: per-occurrence SUM(coverage) and bill unpaid caps are CROSS-ROW invariants.
-- CHECKs cannot enforce them. Task 3.6 must validate them under the tenant lock,
-- together with ownership/currency/source checks; no aggregate trigger is added.
-- D7/D11: CHECKs constrain row shapes, not INSERT-vs-UPDATE privileges. Existing
-- defaults yield pending/attempts=0/fence=0/null lease/null completion. Task 1.4
-- MUST restrict tenant INSERT columns and enforce pending requests, and prohibit
-- tenant work UPDATE/DELETE. These CHECKs alone do NOT stop forged initial state.
-- Pending retries may have nonzero attempts/fence/generation and retained errors.
-- An expired processing lease remains legal for recovery. No requirement is added
-- for failed=6 attempts, skipped>0 attempts, or clearing terminal lease metadata:
-- those extra couplings are not specified by D7. Trusted transitions stay possible.
BEGIN;

ALTER TABLE public.commit_guard_cash_contexts
  ADD CONSTRAINT commitguard_cash_balance_group_check CHECK (
    num_nonnulls(amount_cents, currency, balance_as_of) IN (0, 3)
  ),
  ADD CONSTRAINT commitguard_cash_expense_group_check CHECK (
    num_nonnulls(weekly_operating_expenses_cents, weekly_expenses_currency, weekly_expenses_as_of) IN (0, 3)
  ),
  ADD CONSTRAINT commitguard_cash_currency_check CHECK (
    currency IS NULL OR currency IN ('aud', 'usd', 'nzd', 'gbp', 'eur', 'cad', 'sgd', 'hkd')
  ),
  ADD CONSTRAINT commitguard_expense_currency_check CHECK (
    weekly_expenses_currency IS NULL OR weekly_expenses_currency IN ('aud', 'usd', 'nzd', 'gbp', 'eur', 'cad', 'sgd', 'hkd')
  ),
  ADD CONSTRAINT commitguard_tax_currency_check CHECK (
    tax_protection_currency IS NULL OR tax_protection_currency IN ('aud', 'usd', 'nzd', 'gbp', 'eur', 'cad', 'sgd', 'hkd')
  ),
  ADD CONSTRAINT commitguard_expense_amount_check CHECK (
    weekly_operating_expenses_cents IS NULL OR weekly_operating_expenses_cents >= 0
  ),
  ADD CONSTRAINT commitguard_cash_revision_check CHECK (revision >= 0);

-- Nullable fixed-buffer currency preserves legacy positive untagged buffers for
-- explicit review (D1); neither a balance nor currency equality is required here.
ALTER TABLE public.commit_guard_settings
  ADD CONSTRAINT commitguard_buffer_currency_check CHECK (
    safety_buffer_currency IS NULL OR safety_buffer_currency IN ('aud', 'usd', 'nzd', 'gbp', 'eur', 'cad', 'sgd', 'hkd')
  ),
  ADD CONSTRAINT commitguard_settings_revision_check CHECK (calculation_revision >= 0);

ALTER TABLE public.commitment_coverages
  ADD CONSTRAINT commitguard_coverage_target_check CHECK (
    (target_kind = 'imported_bill' AND imported_bill_id IS NOT NULL AND tax_reserve_category_id IS NULL)
    OR
    (target_kind = 'tax_reserve_category' AND tax_reserve_category_id IS NOT NULL AND imported_bill_id IS NULL)
  ),
  ADD CONSTRAINT commitguard_coverage_amount_check CHECK (covered_cents > 0);

ALTER TABLE public.commit_guard_work_items
  ADD CONSTRAINT commitguard_work_kind_check CHECK (kind IN ('detect', 'evaluate')),
  ADD CONSTRAINT commitguard_work_state_check CHECK (state IN ('pending', 'processing', 'completed', 'skipped', 'failed')),
  ADD CONSTRAINT commitguard_work_attempts_check CHECK (attempts BETWEEN 0 AND 6),
  ADD CONSTRAINT commitguard_work_revision_check CHECK (calculation_revision >= 0),
  ADD CONSTRAINT commitguard_work_generation_check CHECK (generation >= 0),
  ADD CONSTRAINT commitguard_work_fence_check CHECK (fence >= 0),
  ADD CONSTRAINT commitguard_work_lease_pair_check CHECK (
    (lease_owner IS NULL) = (lease_expires_at IS NULL)
  ),
  ADD CONSTRAINT commitguard_work_pending_shape_check CHECK (
    state <> 'pending' OR (lease_owner IS NULL AND lease_expires_at IS NULL AND completed_at IS NULL)
  ),
  ADD CONSTRAINT commitguard_work_processing_shape_check CHECK (
    state <> 'processing' OR (lease_owner IS NOT NULL AND lease_expires_at IS NOT NULL AND completed_at IS NULL)
  ),
  ADD CONSTRAINT commitguard_work_completed_shape_check CHECK (
    state <> 'completed' OR completed_at IS NOT NULL
  );

ALTER TABLE public.commit_guard_evaluation_states
  ADD CONSTRAINT commitguard_evaluation_revision_check CHECK (
    calculation_revision IS NULL OR calculation_revision >= 0
  ),
  ADD CONSTRAINT commitguard_evaluation_cash_revision_check CHECK (
    cash_input_revision IS NULL OR cash_input_revision >= 0
  );

COMMIT;