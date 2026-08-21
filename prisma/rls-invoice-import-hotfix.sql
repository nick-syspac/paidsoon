-- PaidSoon — invoice_import_* RLS hotfix
--
-- Run in Supabase SQL Editor, or with:
--   psql "$DIRECT_URL" -f prisma/rls-invoice-import-hotfix.sql
--
-- The invoice_import_* tables were added to schema.prisma and to the
-- canonical prisma/rls-policies.sql but their migration was never generated,
-- so the tables (and their RLS policies) never existed in the database. This
-- file is intentionally narrow and idempotent (mirrors the pattern in
-- prisma/rls-accounting-connections-hotfix.sql) so it can be safely re-run.

BEGIN;

-- invoice_import_batches
ALTER TABLE invoice_import_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users can view own invoice import batches" ON invoice_import_batches;
DROP POLICY IF EXISTS "users can insert own invoice import batches" ON invoice_import_batches;
DROP POLICY IF EXISTS "users can update own invoice import batches" ON invoice_import_batches;

CREATE POLICY "users can view own invoice import batches"
  ON invoice_import_batches FOR SELECT
  TO authenticated
  USING ((select auth.uid())::text = user_id);

CREATE POLICY "users can insert own invoice import batches"
  ON invoice_import_batches FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid())::text = user_id);

CREATE POLICY "users can update own invoice import batches"
  ON invoice_import_batches FOR UPDATE
  TO authenticated
  USING ((select auth.uid())::text = user_id)
  WITH CHECK ((select auth.uid())::text = user_id);

-- invoice_import_column_mappings
ALTER TABLE invoice_import_column_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users can view own invoice import column mappings" ON invoice_import_column_mappings;
DROP POLICY IF EXISTS "users can insert own invoice import column mappings" ON invoice_import_column_mappings;
DROP POLICY IF EXISTS "users can update own invoice import column mappings" ON invoice_import_column_mappings;
DROP POLICY IF EXISTS "users can delete own invoice import column mappings" ON invoice_import_column_mappings;

CREATE POLICY "users can view own invoice import column mappings"
  ON invoice_import_column_mappings FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM invoice_import_batches
      WHERE invoice_import_batches.id = invoice_import_column_mappings.batch_id
        AND invoice_import_batches.user_id = (select auth.uid())::text
    )
  );

CREATE POLICY "users can insert own invoice import column mappings"
  ON invoice_import_column_mappings FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM invoice_import_batches
      WHERE invoice_import_batches.id = invoice_import_column_mappings.batch_id
        AND invoice_import_batches.user_id = (select auth.uid())::text
    )
  );

CREATE POLICY "users can update own invoice import column mappings"
  ON invoice_import_column_mappings FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM invoice_import_batches
      WHERE invoice_import_batches.id = invoice_import_column_mappings.batch_id
        AND invoice_import_batches.user_id = (select auth.uid())::text
    )
  );

CREATE POLICY "users can delete own invoice import column mappings"
  ON invoice_import_column_mappings FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM invoice_import_batches
      WHERE invoice_import_batches.id = invoice_import_column_mappings.batch_id
        AND invoice_import_batches.user_id = (select auth.uid())::text
    )
  );

-- invoice_import_staging_rows
ALTER TABLE invoice_import_staging_rows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users can view own invoice import staging rows" ON invoice_import_staging_rows;
DROP POLICY IF EXISTS "users can insert own invoice import staging rows" ON invoice_import_staging_rows;
DROP POLICY IF EXISTS "users can update own invoice import staging rows" ON invoice_import_staging_rows;

CREATE POLICY "users can view own invoice import staging rows"
  ON invoice_import_staging_rows FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM invoice_import_batches
      WHERE invoice_import_batches.id = invoice_import_staging_rows.batch_id
        AND invoice_import_batches.user_id = (select auth.uid())::text
    )
  );

CREATE POLICY "users can insert own invoice import staging rows"
  ON invoice_import_staging_rows FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM invoice_import_batches
      WHERE invoice_import_batches.id = invoice_import_staging_rows.batch_id
        AND invoice_import_batches.user_id = (select auth.uid())::text
    )
  );

CREATE POLICY "users can update own invoice import staging rows"
  ON invoice_import_staging_rows FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM invoice_import_batches
      WHERE invoice_import_batches.id = invoice_import_staging_rows.batch_id
        AND invoice_import_batches.user_id = (select auth.uid())::text
    )
  );

-- invoice_import_errors
ALTER TABLE invoice_import_errors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users can view own invoice import errors" ON invoice_import_errors;
DROP POLICY IF EXISTS "users can insert own invoice import errors" ON invoice_import_errors;
DROP POLICY IF EXISTS "users can delete own invoice import errors" ON invoice_import_errors;

CREATE POLICY "users can view own invoice import errors"
  ON invoice_import_errors FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM invoice_import_batches
      WHERE invoice_import_batches.id = invoice_import_errors.batch_id
        AND invoice_import_batches.user_id = (select auth.uid())::text
    )
  );

CREATE POLICY "users can insert own invoice import errors"
  ON invoice_import_errors FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM invoice_import_batches
      WHERE invoice_import_batches.id = invoice_import_errors.batch_id
        AND invoice_import_batches.user_id = (select auth.uid())::text
    )
  );

CREATE POLICY "users can delete own invoice import errors"
  ON invoice_import_errors FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM invoice_import_batches
      WHERE invoice_import_batches.id = invoice_import_errors.batch_id
        AND invoice_import_batches.user_id = (select auth.uid())::text
    )
  );

-- invoice_import_mapping_profiles
ALTER TABLE invoice_import_mapping_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users can view own invoice import mapping profiles" ON invoice_import_mapping_profiles;
DROP POLICY IF EXISTS "users can insert own invoice import mapping profiles" ON invoice_import_mapping_profiles;
DROP POLICY IF EXISTS "users can update own invoice import mapping profiles" ON invoice_import_mapping_profiles;
DROP POLICY IF EXISTS "users can delete own invoice import mapping profiles" ON invoice_import_mapping_profiles;

CREATE POLICY "users can view own invoice import mapping profiles"
  ON invoice_import_mapping_profiles FOR SELECT
  TO authenticated
  USING ((select auth.uid())::text = user_id);

CREATE POLICY "users can insert own invoice import mapping profiles"
  ON invoice_import_mapping_profiles FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid())::text = user_id);

CREATE POLICY "users can update own invoice import mapping profiles"
  ON invoice_import_mapping_profiles FOR UPDATE
  TO authenticated
  USING ((select auth.uid())::text = user_id)
  WITH CHECK ((select auth.uid())::text = user_id);

CREATE POLICY "users can delete own invoice import mapping profiles"
  ON invoice_import_mapping_profiles FOR DELETE
  TO authenticated
  USING ((select auth.uid())::text = user_id);

COMMIT;
