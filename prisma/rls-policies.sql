-- PaidSoon — Supabase Row Level Security Policies
-- Run this in Supabase SQL Editor after running Prisma migrations.
-- These policies ensure strict tenant isolation: users can only access their own data.
--
-- Enforcement model
-- -----------------
-- The Prisma runtime client connects via DATABASE_URL through the Supabase
-- Shared Pooler as `postgres.[ref]`. Enforcement does not rely on that role:
-- for each user request, the application wraps queries in
-- `withUserContext(userId, fn)` (see lib/db/withUserContext.ts), which inside
-- a transaction runs:
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims', '{"sub": "<userId>", "role": "authenticated"}', true);
--   SELECT set_config('request.jwt.claim.sub', '<userId>', true);
--   SELECT set_config('request.jwt.claim.role', 'authenticated', true);
-- These transaction-scoped settings make auth.uid() resolve to <userId>, so
-- the policies below fire and queries cannot read or write rows belonging to
-- other users — even if the application-level WHERE clause is missing.
--
-- The owner / migration role uses DIRECT_URL and bypasses RLS. Cron and webhook
-- code uses `prismaAdmin` (lib/db/admin.ts), which also bypasses RLS by design
-- and is responsible for scoping its own queries.

-- Enable RLS on all application tables
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracked_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE promise_to_pay ENABLE ROW LEVEL SECURITY;
ALTER TABLE promise_escalation_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE arrangements ENABLE ROW LEVEL SECURITY;
ALTER TABLE arrangement_invoice_coverages ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- user_profiles
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "users can view own profile" ON user_profiles;
CREATE POLICY "users can view own profile"
  ON user_profiles FOR SELECT
  USING (auth.uid()::text = "userId");

DROP POLICY IF EXISTS "users can update own profile" ON user_profiles;
CREATE POLICY "users can update own profile"
  ON user_profiles FOR UPDATE
  USING (auth.uid()::text = "userId");

DROP POLICY IF EXISTS "users can insert own profile" ON user_profiles;
CREATE POLICY "users can insert own profile"
  ON user_profiles FOR INSERT
  WITH CHECK (auth.uid()::text = "userId");

-- ---------------------------------------------------------------------------
-- invoice_connections
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "users can view own connections" ON invoice_connections;
CREATE POLICY "users can view own connections"
  ON invoice_connections FOR SELECT
  USING (auth.uid()::text = "userId");

DROP POLICY IF EXISTS "users can insert own connections" ON invoice_connections;
CREATE POLICY "users can insert own connections"
  ON invoice_connections FOR INSERT
  WITH CHECK (auth.uid()::text = "userId");

DROP POLICY IF EXISTS "users can update own connections" ON invoice_connections;
CREATE POLICY "users can update own connections"
  ON invoice_connections FOR UPDATE
  USING (auth.uid()::text = "userId");

-- ---------------------------------------------------------------------------
-- schedules
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "users can view own schedule" ON schedules;
CREATE POLICY "users can view own schedule"
  ON schedules FOR SELECT
  USING (auth.uid()::text = "userId");

DROP POLICY IF EXISTS "users can insert own schedule" ON schedules;
CREATE POLICY "users can insert own schedule"
  ON schedules FOR INSERT
  WITH CHECK (auth.uid()::text = "userId");

DROP POLICY IF EXISTS "users can update own schedule" ON schedules;
CREATE POLICY "users can update own schedule"
  ON schedules FOR UPDATE
  USING (auth.uid()::text = "userId");

-- ---------------------------------------------------------------------------
-- email_settings
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "users can view own email settings" ON email_settings;
CREATE POLICY "users can view own email settings"
  ON email_settings FOR SELECT
  USING (auth.uid()::text = "userId");

DROP POLICY IF EXISTS "users can insert own email settings" ON email_settings;
CREATE POLICY "users can insert own email settings"
  ON email_settings FOR INSERT
  WITH CHECK (auth.uid()::text = "userId");

DROP POLICY IF EXISTS "users can update own email settings" ON email_settings;
CREATE POLICY "users can update own email settings"
  ON email_settings FOR UPDATE
  USING (auth.uid()::text = "userId");

-- ---------------------------------------------------------------------------
-- tracked_invoices
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "users can view own invoices" ON tracked_invoices;
CREATE POLICY "users can view own invoices"
  ON tracked_invoices FOR SELECT
  USING (auth.uid()::text = "userId");

DROP POLICY IF EXISTS "users can insert own invoices" ON tracked_invoices;
CREATE POLICY "users can insert own invoices"
  ON tracked_invoices FOR INSERT
  WITH CHECK (auth.uid()::text = "userId");

DROP POLICY IF EXISTS "users can update own invoices" ON tracked_invoices;
CREATE POLICY "users can update own invoices"
  ON tracked_invoices FOR UPDATE
  USING (auth.uid()::text = "userId");

-- ---------------------------------------------------------------------------
-- Canonical financial layer (financial_contacts / financial_invoices /
-- financial_payments)
-- Users can read their own records. Writes are performed by ingestion paths
-- (accounting sync, Stripe webhook, CSV import) via prismaAdmin or a
-- withUserContext transaction — the INSERT/UPDATE policies below support the
-- withUserContext path.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "users can view own financial contacts" ON financial_contacts;
CREATE POLICY "users can view own financial contacts"
  ON financial_contacts FOR SELECT
  USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "users can insert own financial contacts" ON financial_contacts;
CREATE POLICY "users can insert own financial contacts"
  ON financial_contacts FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "users can update own financial contacts" ON financial_contacts;
CREATE POLICY "users can update own financial contacts"
  ON financial_contacts FOR UPDATE
  USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "users can view own financial invoices" ON financial_invoices;
CREATE POLICY "users can view own financial invoices"
  ON financial_invoices FOR SELECT
  USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "users can insert own financial invoices" ON financial_invoices;
CREATE POLICY "users can insert own financial invoices"
  ON financial_invoices FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "users can update own financial invoices" ON financial_invoices;
CREATE POLICY "users can update own financial invoices"
  ON financial_invoices FOR UPDATE
  USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "users can view own financial payments" ON financial_payments;
CREATE POLICY "users can view own financial payments"
  ON financial_payments FOR SELECT
  USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "users can insert own financial payments" ON financial_payments;
CREATE POLICY "users can insert own financial payments"
  ON financial_payments FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "users can update own financial payments" ON financial_payments;
CREATE POLICY "users can update own financial payments"
  ON financial_payments FOR UPDATE
  USING (auth.uid()::text = user_id);

-- ---------------------------------------------------------------------------
-- email_logs
-- ---------------------------------------------------------------------------
-- email_logs is accessed via tracked_invoice; use a join-based policy
-- NOTE: the `htmlBody`/`textBody` columns added for the email-detail-modal
-- feature are row-level data, not row-visibility gates, so no policy change
-- is required here — the existing join-based policies already scope every
-- column (including the new ones) to the owning user.
DROP POLICY IF EXISTS "users can view own email logs" ON email_logs;
CREATE POLICY "users can view own email logs"
  ON email_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM tracked_invoices
      WHERE tracked_invoices.id = email_logs."trackedInvoiceId"
        AND tracked_invoices."userId" = auth.uid()::text
    )
  );

DROP POLICY IF EXISTS "service role can insert email logs" ON email_logs;
CREATE POLICY "service role can insert email logs"
  ON email_logs FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tracked_invoices
      WHERE tracked_invoices.id = email_logs."trackedInvoiceId"
        AND tracked_invoices."userId" = auth.uid()::text
    )
  ); -- Cron job uses prismaAdmin (service role) which bypasses RLS entirely

-- ---------------------------------------------------------------------------
-- email_templates
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "users can view own email templates" ON email_templates;
CREATE POLICY "users can view own email templates"
  ON email_templates FOR SELECT
  USING (auth.uid()::text = "userId");

DROP POLICY IF EXISTS "users can insert own email templates" ON email_templates;
CREATE POLICY "users can insert own email templates"
  ON email_templates FOR INSERT
  WITH CHECK (auth.uid()::text = "userId");

DROP POLICY IF EXISTS "users can update own email templates" ON email_templates;
CREATE POLICY "users can update own email templates"
  ON email_templates FOR UPDATE
  USING (auth.uid()::text = "userId");

DROP POLICY IF EXISTS "users can delete own email templates" ON email_templates;
CREATE POLICY "users can delete own email templates"
  ON email_templates FOR DELETE
  USING (auth.uid()::text = "userId");

-- ---------------------------------------------------------------------------
-- ai_usage_logs
-- Users may read their own rows. Inserts are performed by the application
-- via prismaAdmin (service role) only — no INSERT policy for users.
-- ---------------------------------------------------------------------------
ALTER TABLE ai_usage_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users can view own AI usage logs" ON ai_usage_logs;
CREATE POLICY "users can view own AI usage logs"
  ON ai_usage_logs FOR SELECT
  USING (auth.uid()::text = user_id);

-- ---------------------------------------------------------------------------
-- accounting_connections
-- Users can read/write their own connections. Cron and webhook code uses
-- prismaAdmin (service role) which bypasses RLS by design.
-- ---------------------------------------------------------------------------
ALTER TABLE accounting_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users can view own accounting connections" ON accounting_connections;
CREATE POLICY "users can view own accounting connections"
  ON accounting_connections FOR SELECT
  USING (auth.uid()::text = "userId");

DROP POLICY IF EXISTS "users can insert own accounting connections" ON accounting_connections;
CREATE POLICY "users can insert own accounting connections"
  ON accounting_connections FOR INSERT
  WITH CHECK (auth.uid()::text = "userId");

DROP POLICY IF EXISTS "users can update own accounting connections" ON accounting_connections;
CREATE POLICY "users can update own accounting connections"
  ON accounting_connections FOR UPDATE
  USING (auth.uid()::text = "userId")
  WITH CHECK (auth.uid()::text = "userId");

DROP POLICY IF EXISTS "users can delete own accounting connections" ON accounting_connections;
CREATE POLICY "users can delete own accounting connections"
  ON accounting_connections FOR DELETE
  USING (auth.uid()::text = "userId");

-- ---------------------------------------------------------------------------
-- accounting_sync_runs
-- Users can read their own sync run history. Writes are performed by the
-- sync cron/manual route via prismaAdmin (service role).
-- ---------------------------------------------------------------------------
ALTER TABLE accounting_sync_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users can view own sync runs" ON accounting_sync_runs;
CREATE POLICY "users can view own sync runs"
  ON accounting_sync_runs FOR SELECT
  USING (auth.uid()::text = "userId");

-- No user INSERT/UPDATE policy — cron uses prismaAdmin (service role)

-- ---------------------------------------------------------------------------
-- provider_invoice_mappings
-- provider_invoice_mappings and provider_contact_mappings were retired by the
-- canonical-financial-data-model change; their role is absorbed by provenance
-- fields on the canonical financial tables.

-- ---------------------------------------------------------------------------
-- oauth_states
-- Short-lived CSRF nonces for OAuth callbacks. Users can read their own
-- states. Insert/delete is performed by the connect route (uses withUserContext).
-- Expired rows are cleaned up by the sync cron (prismaAdmin).
-- ---------------------------------------------------------------------------
ALTER TABLE oauth_states ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users can view own oauth states" ON oauth_states;
CREATE POLICY "users can view own oauth states"
  ON oauth_states FOR SELECT
  USING (auth.uid()::text = "userId");

DROP POLICY IF EXISTS "users can insert own oauth states" ON oauth_states;
CREATE POLICY "users can insert own oauth states"
  ON oauth_states FOR INSERT
  WITH CHECK (auth.uid()::text = "userId");

DROP POLICY IF EXISTS "users can delete own oauth states" ON oauth_states;
CREATE POLICY "users can delete own oauth states"
  ON oauth_states FOR DELETE
  USING (auth.uid()::text = "userId");

-- ---------------------------------------------------------------------------
-- imported_bills
-- Users can read their own imported bills. Writes are performed by sync code
-- via prismaAdmin.
-- ---------------------------------------------------------------------------
ALTER TABLE imported_bills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users can view own imported bills" ON imported_bills;
CREATE POLICY "users can view own imported bills"
  ON imported_bills FOR SELECT
  USING (auth.uid()::text = user_id);

-- ---------------------------------------------------------------------------
-- imported_bank_transactions
-- Users can read their own imported bank transactions. Writes are performed by
-- sync code via prismaAdmin.
-- ---------------------------------------------------------------------------
ALTER TABLE imported_bank_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users can view own imported bank transactions" ON imported_bank_transactions;
CREATE POLICY "users can view own imported bank transactions"
  ON imported_bank_transactions FOR SELECT
  USING (auth.uid()::text = user_id);

-- ---------------------------------------------------------------------------
-- supplier_profiles
-- Users can read their own supplier profiles. Writes are performed by sync
-- code via prismaAdmin.
-- ---------------------------------------------------------------------------
ALTER TABLE supplier_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users can view own supplier profiles" ON supplier_profiles;
CREATE POLICY "users can view own supplier profiles"
  ON supplier_profiles FOR SELECT
  USING (auth.uid()::text = user_id);

-- ---------------------------------------------------------------------------
-- spend_insights
-- Users can read their own spend insights. UPDATE is row-scoped by RLS and
-- column-scoped by GRANT so authenticated users can mutate lifecycle fields
-- only (`state`, `resolved_at`, `updated_at`).
-- Inserts are performed by the insight pipeline via prismaAdmin.
-- ---------------------------------------------------------------------------
ALTER TABLE spend_insights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users can view own spend insights" ON spend_insights;
CREATE POLICY "users can view own spend insights"
  ON spend_insights FOR SELECT
  USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "users can update own spend insights" ON spend_insights;
CREATE POLICY "users can update own spend insights"
  ON spend_insights FOR UPDATE
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

REVOKE UPDATE ON TABLE spend_insights FROM authenticated;
GRANT UPDATE (state, resolved_at, updated_at) ON TABLE spend_insights TO authenticated;

-- ---------------------------------------------------------------------------
-- cash_forecast_snapshots
-- Users can read their own forecast snapshots. Writes are performed by the
-- forecasting pipeline via prismaAdmin.
-- ---------------------------------------------------------------------------
ALTER TABLE cash_forecast_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users can view own cash forecast snapshots" ON cash_forecast_snapshots;
CREATE POLICY "users can view own cash forecast snapshots"
  ON cash_forecast_snapshots FOR SELECT
  USING (auth.uid()::text = user_id);

-- ---------------------------------------------------------------------------
-- scheduled_task_claims / dispatcher_heartbeats
-- Internal Railway Celery orchestration state. No end-user-facing route reads
-- or writes these — the Celery worker connects with a trusted/admin role
-- (same RLS-bypass posture as prismaAdmin, documented in
-- openspec/changes/migrate-scheduled-jobs-to-railway-celery/design.md).
-- RLS is enabled with no policies: the `authenticated` role has no access at
-- all, matching the dashboard never needing to query these tables directly.
-- ---------------------------------------------------------------------------
ALTER TABLE scheduled_task_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatcher_heartbeats ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- promise_to_pay
-- Users can read their own promise records. Inserts and updates are
-- performed via prismaAdmin (service role): the public promise endpoint uses
-- prismaAdmin with userId sourced from the DB lookup, not the request body.
-- This is a documented RLS bypass — see design.md Decision #4.
-- ---------------------------------------------------------------------------
ALTER TABLE promise_to_pay ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users can view own promises to pay" ON promise_to_pay;
CREATE POLICY "users can view own promises to pay"
  ON promise_to_pay FOR SELECT
  USING (auth.uid()::text = "user_id");

-- No user INSERT/UPDATE/DELETE policy — public endpoint and cron use
-- prismaAdmin (service role) which bypasses RLS by design.

-- ---------------------------------------------------------------------------
-- weekly_debtor_summary_deliveries
-- Internal-only deliverability log for the weekly debtor summary worker.
-- No user-facing route reads or writes this table; the Railway worker uses
-- prismaAdmin-style access to track idempotent sends per tenant/week.
-- ---------------------------------------------------------------------------
ALTER TABLE weekly_debtor_summary_deliveries ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- promise_escalation_policies
-- Users can read and update their own retry/escalation configuration.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "users can view own promise escalation policy" ON promise_escalation_policies;
CREATE POLICY "users can view own promise escalation policy"
  ON promise_escalation_policies FOR SELECT
  USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "users can insert own promise escalation policy" ON promise_escalation_policies;
CREATE POLICY "users can insert own promise escalation policy"
  ON promise_escalation_policies FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "users can update own promise escalation policy" ON promise_escalation_policies;
CREATE POLICY "users can update own promise escalation policy"
  ON promise_escalation_policies FOR UPDATE
  USING (auth.uid()::text = user_id);

-- ---------------------------------------------------------------------------
-- arrangements
-- Users can create and manage their own freelancer-managed arrangement records.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "users can view own arrangements" ON arrangements;
CREATE POLICY "users can view own arrangements"
  ON arrangements FOR SELECT
  USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "users can insert own arrangements" ON arrangements;
CREATE POLICY "users can insert own arrangements"
  ON arrangements FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "users can update own arrangements" ON arrangements;
CREATE POLICY "users can update own arrangements"
  ON arrangements FOR UPDATE
  USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "users can delete own arrangements" ON arrangements;
CREATE POLICY "users can delete own arrangements"
  ON arrangements FOR DELETE
  USING (auth.uid()::text = user_id);

-- ---------------------------------------------------------------------------
-- arrangement_invoice_coverages
-- Coverage rows are user-scoped and link arrangement headers to tracked invoices.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "users can view own arrangement coverages" ON arrangement_invoice_coverages;
CREATE POLICY "users can view own arrangement coverages"
  ON arrangement_invoice_coverages FOR SELECT
  USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "users can insert own arrangement coverages" ON arrangement_invoice_coverages;
CREATE POLICY "users can insert own arrangement coverages"
  ON arrangement_invoice_coverages FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "users can update own arrangement coverages" ON arrangement_invoice_coverages;
CREATE POLICY "users can update own arrangement coverages"
  ON arrangement_invoice_coverages FOR UPDATE
  USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "users can delete own arrangement coverages" ON arrangement_invoice_coverages;
CREATE POLICY "users can delete own arrangement coverages"
  ON arrangement_invoice_coverages FOR DELETE
  USING (auth.uid()::text = user_id);

-- ---------------------------------------------------------------------------
-- customers
-- Tenant-scoped debtor directory. Users can read/write their own customer
-- records; the reminder cron reads via prismaAdmin (service role), which
-- bypasses RLS by design.
-- ---------------------------------------------------------------------------
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users can view own customers" ON customers;
CREATE POLICY "users can view own customers"
  ON customers FOR SELECT
  USING (auth.uid()::text = "userId");

DROP POLICY IF EXISTS "users can insert own customers" ON customers;
CREATE POLICY "users can insert own customers"
  ON customers FOR INSERT
  WITH CHECK (auth.uid()::text = "userId");

DROP POLICY IF EXISTS "users can update own customers" ON customers;
CREATE POLICY "users can update own customers"
  ON customers FOR UPDATE
  USING (auth.uid()::text = "userId")
  WITH CHECK (auth.uid()::text = "userId");

-- ---------------------------------------------------------------------------
-- invoice_import_batches
-- Users can create and manage their own spreadsheet import batches. No user
-- DELETE policy — batches move through status transitions (uploaded ->
-- mapping -> validated -> processing -> completed/failed/cancelled) instead
-- of being removed; retention cleanup of raw uploads/staging rows runs via
-- prismaAdmin (service role), which bypasses RLS by design.
-- ---------------------------------------------------------------------------
ALTER TABLE invoice_import_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users can view own invoice import batches" ON invoice_import_batches;
CREATE POLICY "users can view own invoice import batches"
  ON invoice_import_batches FOR SELECT
  USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "users can insert own invoice import batches" ON invoice_import_batches;
CREATE POLICY "users can insert own invoice import batches"
  ON invoice_import_batches FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "users can update own invoice import batches" ON invoice_import_batches;
CREATE POLICY "users can update own invoice import batches"
  ON invoice_import_batches FOR UPDATE
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

-- ---------------------------------------------------------------------------
-- invoice_import_column_mappings
-- Scoped via batch_id which belongs to the owning user's batch.
-- ---------------------------------------------------------------------------
ALTER TABLE invoice_import_column_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users can view own invoice import column mappings" ON invoice_import_column_mappings;
CREATE POLICY "users can view own invoice import column mappings"
  ON invoice_import_column_mappings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM invoice_import_batches
      WHERE invoice_import_batches.id = invoice_import_column_mappings.batch_id
        AND invoice_import_batches.user_id = auth.uid()::text
    )
  );

DROP POLICY IF EXISTS "users can insert own invoice import column mappings" ON invoice_import_column_mappings;
CREATE POLICY "users can insert own invoice import column mappings"
  ON invoice_import_column_mappings FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM invoice_import_batches
      WHERE invoice_import_batches.id = invoice_import_column_mappings.batch_id
        AND invoice_import_batches.user_id = auth.uid()::text
    )
  );

DROP POLICY IF EXISTS "users can update own invoice import column mappings" ON invoice_import_column_mappings;
CREATE POLICY "users can update own invoice import column mappings"
  ON invoice_import_column_mappings FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM invoice_import_batches
      WHERE invoice_import_batches.id = invoice_import_column_mappings.batch_id
        AND invoice_import_batches.user_id = auth.uid()::text
    )
  );

DROP POLICY IF EXISTS "users can delete own invoice import column mappings" ON invoice_import_column_mappings;
CREATE POLICY "users can delete own invoice import column mappings"
  ON invoice_import_column_mappings FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM invoice_import_batches
      WHERE invoice_import_batches.id = invoice_import_column_mappings.batch_id
        AND invoice_import_batches.user_id = auth.uid()::text
    )
  );

-- ---------------------------------------------------------------------------
-- invoice_import_staging_rows
-- Scoped via batch_id which belongs to the owning user's batch. No user
-- DELETE policy — cascade delete happens only when the parent batch is
-- removed by the retention cleanup job (prismaAdmin).
-- ---------------------------------------------------------------------------
ALTER TABLE invoice_import_staging_rows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users can view own invoice import staging rows" ON invoice_import_staging_rows;
CREATE POLICY "users can view own invoice import staging rows"
  ON invoice_import_staging_rows FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM invoice_import_batches
      WHERE invoice_import_batches.id = invoice_import_staging_rows.batch_id
        AND invoice_import_batches.user_id = auth.uid()::text
    )
  );

DROP POLICY IF EXISTS "users can insert own invoice import staging rows" ON invoice_import_staging_rows;
CREATE POLICY "users can insert own invoice import staging rows"
  ON invoice_import_staging_rows FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM invoice_import_batches
      WHERE invoice_import_batches.id = invoice_import_staging_rows.batch_id
        AND invoice_import_batches.user_id = auth.uid()::text
    )
  );

DROP POLICY IF EXISTS "users can update own invoice import staging rows" ON invoice_import_staging_rows;
CREATE POLICY "users can update own invoice import staging rows"
  ON invoice_import_staging_rows FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM invoice_import_batches
      WHERE invoice_import_batches.id = invoice_import_staging_rows.batch_id
        AND invoice_import_batches.user_id = auth.uid()::text
    )
  );

-- ---------------------------------------------------------------------------
-- invoice_import_errors
-- Scoped via batch_id which belongs to the owning user's batch. Validation
-- reruns replace prior error rows (delete then insert), no update needed.
-- ---------------------------------------------------------------------------
ALTER TABLE invoice_import_errors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users can view own invoice import errors" ON invoice_import_errors;
CREATE POLICY "users can view own invoice import errors"
  ON invoice_import_errors FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM invoice_import_batches
      WHERE invoice_import_batches.id = invoice_import_errors.batch_id
        AND invoice_import_batches.user_id = auth.uid()::text
    )
  );

DROP POLICY IF EXISTS "users can insert own invoice import errors" ON invoice_import_errors;
CREATE POLICY "users can insert own invoice import errors"
  ON invoice_import_errors FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM invoice_import_batches
      WHERE invoice_import_batches.id = invoice_import_errors.batch_id
        AND invoice_import_batches.user_id = auth.uid()::text
    )
  );

DROP POLICY IF EXISTS "users can delete own invoice import errors" ON invoice_import_errors;
CREATE POLICY "users can delete own invoice import errors"
  ON invoice_import_errors FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM invoice_import_batches
      WHERE invoice_import_batches.id = invoice_import_errors.batch_id
        AND invoice_import_batches.user_id = auth.uid()::text
    )
  );

-- ---------------------------------------------------------------------------
-- invoice_import_mapping_profiles
-- Users can save and reuse their own per-tenant column mapping profiles.
-- ---------------------------------------------------------------------------
ALTER TABLE invoice_import_mapping_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users can view own invoice import mapping profiles" ON invoice_import_mapping_profiles;
CREATE POLICY "users can view own invoice import mapping profiles"
  ON invoice_import_mapping_profiles FOR SELECT
  USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "users can insert own invoice import mapping profiles" ON invoice_import_mapping_profiles;
CREATE POLICY "users can insert own invoice import mapping profiles"
  ON invoice_import_mapping_profiles FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "users can update own invoice import mapping profiles" ON invoice_import_mapping_profiles;
CREATE POLICY "users can update own invoice import mapping profiles"
  ON invoice_import_mapping_profiles FOR UPDATE
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "users can delete own invoice import mapping profiles" ON invoice_import_mapping_profiles;
CREATE POLICY "users can delete own invoice import mapping profiles"
  ON invoice_import_mapping_profiles FOR DELETE
  USING (auth.uid()::text = user_id);

-- ---------------------------------------------------------------------------
-- invoice_payments
-- Append-only payment ledger per invoice. No user UPDATE or DELETE policy —
-- payments are never edited or removed, only ever inserted (add-invoice-payment-ledger).
-- ---------------------------------------------------------------------------
ALTER TABLE invoice_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users can view own invoice payments" ON invoice_payments;
CREATE POLICY "users can view own invoice payments"
  ON invoice_payments FOR SELECT
  USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "users can insert own invoice payments" ON invoice_payments;
CREATE POLICY "users can insert own invoice payments"
  ON invoice_payments FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);

-- ---------------------------------------------------------------------------
-- Platform Admin Tables (deny-all for anon and authenticated roles)
-- These tables are ONLY accessible via prismaAdmin (service role / BYPASSRLS).
-- No tenant-level Supabase client may read, insert, update, or delete rows.
-- ---------------------------------------------------------------------------
ALTER TABLE platform_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_invitations ENABLE ROW LEVEL SECURITY;

-- Deny all SELECT for anon and authenticated roles
DROP POLICY IF EXISTS "admin deny select anon" ON platform_roles;
CREATE POLICY "admin deny select anon"
  ON platform_roles     FOR SELECT TO anon          USING (false);
DROP POLICY IF EXISTS "admin deny select auth" ON platform_roles;
CREATE POLICY "admin deny select auth"
  ON platform_roles     FOR SELECT TO authenticated  USING (false);
DROP POLICY IF EXISTS "admin deny insert anon" ON platform_roles;
CREATE POLICY "admin deny insert anon"
  ON platform_roles     FOR INSERT TO anon           WITH CHECK (false);
DROP POLICY IF EXISTS "admin deny insert auth" ON platform_roles;
CREATE POLICY "admin deny insert auth"
  ON platform_roles     FOR INSERT TO authenticated  WITH CHECK (false);
DROP POLICY IF EXISTS "admin deny update anon" ON platform_roles;
CREATE POLICY "admin deny update anon"
  ON platform_roles     FOR UPDATE TO anon           USING (false);
DROP POLICY IF EXISTS "admin deny update auth" ON platform_roles;
CREATE POLICY "admin deny update auth"
  ON platform_roles     FOR UPDATE TO authenticated  USING (false);
DROP POLICY IF EXISTS "admin deny delete anon" ON platform_roles;
CREATE POLICY "admin deny delete anon"
  ON platform_roles     FOR DELETE TO anon           USING (false);
DROP POLICY IF EXISTS "admin deny delete auth" ON platform_roles;
CREATE POLICY "admin deny delete auth"
  ON platform_roles     FOR DELETE TO authenticated  USING (false);

DROP POLICY IF EXISTS "devices deny select anon" ON admin_devices;
CREATE POLICY "devices deny select anon"
  ON admin_devices      FOR SELECT TO anon          USING (false);
DROP POLICY IF EXISTS "devices deny select auth" ON admin_devices;
CREATE POLICY "devices deny select auth"
  ON admin_devices      FOR SELECT TO authenticated  USING (false);
DROP POLICY IF EXISTS "devices deny insert anon" ON admin_devices;
CREATE POLICY "devices deny insert anon"
  ON admin_devices      FOR INSERT TO anon           WITH CHECK (false);
DROP POLICY IF EXISTS "devices deny insert auth" ON admin_devices;
CREATE POLICY "devices deny insert auth"
  ON admin_devices      FOR INSERT TO authenticated  WITH CHECK (false);
DROP POLICY IF EXISTS "devices deny update anon" ON admin_devices;
CREATE POLICY "devices deny update anon"
  ON admin_devices      FOR UPDATE TO anon           USING (false);
DROP POLICY IF EXISTS "devices deny update auth" ON admin_devices;
CREATE POLICY "devices deny update auth"
  ON admin_devices      FOR UPDATE TO authenticated  USING (false);
DROP POLICY IF EXISTS "devices deny delete anon" ON admin_devices;
CREATE POLICY "devices deny delete anon"
  ON admin_devices      FOR DELETE TO anon           USING (false);
DROP POLICY IF EXISTS "devices deny delete auth" ON admin_devices;
CREATE POLICY "devices deny delete auth"
  ON admin_devices      FOR DELETE TO authenticated  USING (false);

DROP POLICY IF EXISTS "challenges deny select anon" ON admin_challenges;
CREATE POLICY "challenges deny select anon"
  ON admin_challenges   FOR SELECT TO anon          USING (false);
DROP POLICY IF EXISTS "challenges deny select auth" ON admin_challenges;
CREATE POLICY "challenges deny select auth"
  ON admin_challenges   FOR SELECT TO authenticated  USING (false);
DROP POLICY IF EXISTS "challenges deny insert anon" ON admin_challenges;
CREATE POLICY "challenges deny insert anon"
  ON admin_challenges   FOR INSERT TO anon           WITH CHECK (false);
DROP POLICY IF EXISTS "challenges deny insert auth" ON admin_challenges;
CREATE POLICY "challenges deny insert auth"
  ON admin_challenges   FOR INSERT TO authenticated  WITH CHECK (false);
DROP POLICY IF EXISTS "challenges deny update anon" ON admin_challenges;
CREATE POLICY "challenges deny update anon"
  ON admin_challenges   FOR UPDATE TO anon           USING (false);
DROP POLICY IF EXISTS "challenges deny update auth" ON admin_challenges;
CREATE POLICY "challenges deny update auth"
  ON admin_challenges   FOR UPDATE TO authenticated  USING (false);
DROP POLICY IF EXISTS "challenges deny delete anon" ON admin_challenges;
CREATE POLICY "challenges deny delete anon"
  ON admin_challenges   FOR DELETE TO anon           USING (false);
DROP POLICY IF EXISTS "challenges deny delete auth" ON admin_challenges;
CREATE POLICY "challenges deny delete auth"
  ON admin_challenges   FOR DELETE TO authenticated  USING (false);

DROP POLICY IF EXISTS "sessions deny select anon" ON admin_sessions;
CREATE POLICY "sessions deny select anon"
  ON admin_sessions     FOR SELECT TO anon          USING (false);
DROP POLICY IF EXISTS "sessions deny select auth" ON admin_sessions;
CREATE POLICY "sessions deny select auth"
  ON admin_sessions     FOR SELECT TO authenticated  USING (false);
DROP POLICY IF EXISTS "sessions deny insert anon" ON admin_sessions;
CREATE POLICY "sessions deny insert anon"
  ON admin_sessions     FOR INSERT TO anon           WITH CHECK (false);
DROP POLICY IF EXISTS "sessions deny insert auth" ON admin_sessions;
CREATE POLICY "sessions deny insert auth"
  ON admin_sessions     FOR INSERT TO authenticated  WITH CHECK (false);
DROP POLICY IF EXISTS "sessions deny update anon" ON admin_sessions;
CREATE POLICY "sessions deny update anon"
  ON admin_sessions     FOR UPDATE TO anon           USING (false);
DROP POLICY IF EXISTS "sessions deny update auth" ON admin_sessions;
CREATE POLICY "sessions deny update auth"
  ON admin_sessions     FOR UPDATE TO authenticated  USING (false);
DROP POLICY IF EXISTS "sessions deny delete anon" ON admin_sessions;
CREATE POLICY "sessions deny delete anon"
  ON admin_sessions     FOR DELETE TO anon           USING (false);
DROP POLICY IF EXISTS "sessions deny delete auth" ON admin_sessions;
CREATE POLICY "sessions deny delete auth"
  ON admin_sessions     FOR DELETE TO authenticated  USING (false);

DROP POLICY IF EXISTS "audit deny select anon" ON admin_audit_events;
CREATE POLICY "audit deny select anon"
  ON admin_audit_events FOR SELECT TO anon          USING (false);
DROP POLICY IF EXISTS "audit deny select auth" ON admin_audit_events;
CREATE POLICY "audit deny select auth"
  ON admin_audit_events FOR SELECT TO authenticated  USING (false);
DROP POLICY IF EXISTS "audit deny insert anon" ON admin_audit_events;
CREATE POLICY "audit deny insert anon"
  ON admin_audit_events FOR INSERT TO anon           WITH CHECK (false);
DROP POLICY IF EXISTS "audit deny insert auth" ON admin_audit_events;
CREATE POLICY "audit deny insert auth"
  ON admin_audit_events FOR INSERT TO authenticated  WITH CHECK (false);
DROP POLICY IF EXISTS "audit deny update anon" ON admin_audit_events;
CREATE POLICY "audit deny update anon"
  ON admin_audit_events FOR UPDATE TO anon           USING (false);
DROP POLICY IF EXISTS "audit deny update auth" ON admin_audit_events;
CREATE POLICY "audit deny update auth"
  ON admin_audit_events FOR UPDATE TO authenticated  USING (false);
DROP POLICY IF EXISTS "audit deny delete anon" ON admin_audit_events;
CREATE POLICY "audit deny delete anon"
  ON admin_audit_events FOR DELETE TO anon           USING (false);
DROP POLICY IF EXISTS "audit deny delete auth" ON admin_audit_events;
CREATE POLICY "audit deny delete auth"
  ON admin_audit_events FOR DELETE TO authenticated  USING (false);

DROP POLICY IF EXISTS "invites deny select anon" ON staff_invitations;
CREATE POLICY "invites deny select anon"
  ON staff_invitations  FOR SELECT TO anon          USING (false);
DROP POLICY IF EXISTS "invites deny select auth" ON staff_invitations;
CREATE POLICY "invites deny select auth"
  ON staff_invitations  FOR SELECT TO authenticated  USING (false);
DROP POLICY IF EXISTS "invites deny insert anon" ON staff_invitations;
CREATE POLICY "invites deny insert anon"
  ON staff_invitations  FOR INSERT TO anon           WITH CHECK (false);
DROP POLICY IF EXISTS "invites deny insert auth" ON staff_invitations;
CREATE POLICY "invites deny insert auth"
  ON staff_invitations  FOR INSERT TO authenticated  WITH CHECK (false);
DROP POLICY IF EXISTS "invites deny update anon" ON staff_invitations;
CREATE POLICY "invites deny update anon"
  ON staff_invitations  FOR UPDATE TO anon           USING (false);
DROP POLICY IF EXISTS "invites deny update auth" ON staff_invitations;
CREATE POLICY "invites deny update auth"
  ON staff_invitations  FOR UPDATE TO authenticated  USING (false);
DROP POLICY IF EXISTS "invites deny delete anon" ON staff_invitations;
CREATE POLICY "invites deny delete anon"
  ON staff_invitations  FOR DELETE TO anon           USING (false);
DROP POLICY IF EXISTS "invites deny delete auth" ON staff_invitations;
CREATE POLICY "invites deny delete auth"
  ON staff_invitations  FOR DELETE TO authenticated  USING (false);

-- ---------------------------------------------------------------------------
-- Audit Retention Logs (archival tracking)
-- Deny-all for anon and authenticated roles (prismaAdmin only)
-- ---------------------------------------------------------------------------
ALTER TABLE audit_retention_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "retention deny select anon" ON audit_retention_logs;
CREATE POLICY "retention deny select anon"
  ON audit_retention_logs FOR SELECT TO anon          USING (false);
DROP POLICY IF EXISTS "retention deny select auth" ON audit_retention_logs;
CREATE POLICY "retention deny select auth"
  ON audit_retention_logs FOR SELECT TO authenticated  USING (false);
DROP POLICY IF EXISTS "retention deny insert anon" ON audit_retention_logs;
CREATE POLICY "retention deny insert anon"
  ON audit_retention_logs FOR INSERT TO anon           WITH CHECK (false);
DROP POLICY IF EXISTS "retention deny insert auth" ON audit_retention_logs;
CREATE POLICY "retention deny insert auth"
  ON audit_retention_logs FOR INSERT TO authenticated  WITH CHECK (false);
DROP POLICY IF EXISTS "retention deny update anon" ON audit_retention_logs;
CREATE POLICY "retention deny update anon"
  ON audit_retention_logs FOR UPDATE TO anon           USING (false);
DROP POLICY IF EXISTS "retention deny update auth" ON audit_retention_logs;
CREATE POLICY "retention deny update auth"
  ON audit_retention_logs FOR UPDATE TO authenticated  USING (false);
DROP POLICY IF EXISTS "retention deny delete anon" ON audit_retention_logs;
CREATE POLICY "retention deny delete anon"
  ON audit_retention_logs FOR DELETE TO anon           USING (false);
DROP POLICY IF EXISTS "retention deny delete auth" ON audit_retention_logs;
CREATE POLICY "retention deny delete auth"
  ON audit_retention_logs FOR DELETE TO authenticated  USING (false);

-- ---------------------------------------------------------------------------
-- Training Studio Tables (admin-authored platform content)
-- Deny-all for anon and authenticated roles (prismaAdmin only)
-- ---------------------------------------------------------------------------
ALTER TABLE training_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_destination_usages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "training content deny select anon" ON training_content;
CREATE POLICY "training content deny select anon"
  ON training_content            FOR SELECT TO anon          USING (false);
DROP POLICY IF EXISTS "training content deny select auth" ON training_content;
CREATE POLICY "training content deny select auth"
  ON training_content            FOR SELECT TO authenticated  USING (false);
DROP POLICY IF EXISTS "training content deny insert anon" ON training_content;
CREATE POLICY "training content deny insert anon"
  ON training_content            FOR INSERT TO anon           WITH CHECK (false);
DROP POLICY IF EXISTS "training content deny insert auth" ON training_content;
CREATE POLICY "training content deny insert auth"
  ON training_content            FOR INSERT TO authenticated  WITH CHECK (false);
DROP POLICY IF EXISTS "training content deny update anon" ON training_content;
CREATE POLICY "training content deny update anon"
  ON training_content            FOR UPDATE TO anon           USING (false);
DROP POLICY IF EXISTS "training content deny update auth" ON training_content;
CREATE POLICY "training content deny update auth"
  ON training_content            FOR UPDATE TO authenticated  USING (false);
DROP POLICY IF EXISTS "training content deny delete anon" ON training_content;
CREATE POLICY "training content deny delete anon"
  ON training_content            FOR DELETE TO anon           USING (false);
DROP POLICY IF EXISTS "training content deny delete auth" ON training_content;
CREATE POLICY "training content deny delete auth"
  ON training_content            FOR DELETE TO authenticated  USING (false);

DROP POLICY IF EXISTS "training revisions deny select anon" ON training_revisions;
CREATE POLICY "training revisions deny select anon"
  ON training_revisions          FOR SELECT TO anon          USING (false);
DROP POLICY IF EXISTS "training revisions deny select auth" ON training_revisions;
CREATE POLICY "training revisions deny select auth"
  ON training_revisions          FOR SELECT TO authenticated  USING (false);
DROP POLICY IF EXISTS "training revisions deny insert anon" ON training_revisions;
CREATE POLICY "training revisions deny insert anon"
  ON training_revisions          FOR INSERT TO anon           WITH CHECK (false);
DROP POLICY IF EXISTS "training revisions deny insert auth" ON training_revisions;
CREATE POLICY "training revisions deny insert auth"
  ON training_revisions          FOR INSERT TO authenticated  WITH CHECK (false);
DROP POLICY IF EXISTS "training revisions deny update anon" ON training_revisions;
CREATE POLICY "training revisions deny update anon"
  ON training_revisions          FOR UPDATE TO anon           USING (false);
DROP POLICY IF EXISTS "training revisions deny update auth" ON training_revisions;
CREATE POLICY "training revisions deny update auth"
  ON training_revisions          FOR UPDATE TO authenticated  USING (false);
DROP POLICY IF EXISTS "training revisions deny delete anon" ON training_revisions;
CREATE POLICY "training revisions deny delete anon"
  ON training_revisions          FOR DELETE TO anon           USING (false);
DROP POLICY IF EXISTS "training revisions deny delete auth" ON training_revisions;
CREATE POLICY "training revisions deny delete auth"
  ON training_revisions          FOR DELETE TO authenticated  USING (false);

DROP POLICY IF EXISTS "training destinations deny select anon" ON training_destination_usages;
CREATE POLICY "training destinations deny select anon"
  ON training_destination_usages FOR SELECT TO anon          USING (false);
DROP POLICY IF EXISTS "training destinations deny select auth" ON training_destination_usages;
CREATE POLICY "training destinations deny select auth"
  ON training_destination_usages FOR SELECT TO authenticated  USING (false);
DROP POLICY IF EXISTS "training destinations deny insert anon" ON training_destination_usages;
CREATE POLICY "training destinations deny insert anon"
  ON training_destination_usages FOR INSERT TO anon           WITH CHECK (false);
DROP POLICY IF EXISTS "training destinations deny insert auth" ON training_destination_usages;
CREATE POLICY "training destinations deny insert auth"
  ON training_destination_usages FOR INSERT TO authenticated  WITH CHECK (false);
DROP POLICY IF EXISTS "training destinations deny update anon" ON training_destination_usages;
CREATE POLICY "training destinations deny update anon"
  ON training_destination_usages FOR UPDATE TO anon           USING (false);
DROP POLICY IF EXISTS "training destinations deny update auth" ON training_destination_usages;
CREATE POLICY "training destinations deny update auth"
  ON training_destination_usages FOR UPDATE TO authenticated  USING (false);
DROP POLICY IF EXISTS "training destinations deny delete anon" ON training_destination_usages;
CREATE POLICY "training destinations deny delete anon"
  ON training_destination_usages FOR DELETE TO anon           USING (false);
DROP POLICY IF EXISTS "training destinations deny delete auth" ON training_destination_usages;
CREATE POLICY "training destinations deny delete auth"
  ON training_destination_usages FOR DELETE TO authenticated  USING (false);
