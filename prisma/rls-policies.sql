-- PaidSoon — Supabase Row Level Security Policies
-- Run this in Supabase SQL Editor after running Prisma migrations.
-- These policies ensure strict tenant isolation: users can only access their own data.
--
-- Enforcement model
-- -----------------
-- The Prisma runtime client connects via DATABASE_URL as a role that does NOT
-- have BYPASSRLS (Supabase: `authenticator` or a custom role granted
-- `authenticated`). For each user request, the application wraps queries in
-- `withUserContext(userId, fn)` (see lib/db/withUserContext.ts), which inside
-- a transaction runs:
--   SELECT set_config('request.jwt.claims', '{"sub": "<userId>", "role": "authenticated"}', true);
--   SET LOCAL ROLE authenticated;
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
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE promise_to_pay ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- user_profiles
-- ---------------------------------------------------------------------------
CREATE POLICY "users can view own profile"
  ON user_profiles FOR SELECT
  USING (auth.uid()::text = "userId");

CREATE POLICY "users can update own profile"
  ON user_profiles FOR UPDATE
  USING (auth.uid()::text = "userId");

CREATE POLICY "users can insert own profile"
  ON user_profiles FOR INSERT
  WITH CHECK (auth.uid()::text = "userId");

-- ---------------------------------------------------------------------------
-- invoice_connections
-- ---------------------------------------------------------------------------
CREATE POLICY "users can view own connections"
  ON invoice_connections FOR SELECT
  USING (auth.uid()::text = "userId");

CREATE POLICY "users can insert own connections"
  ON invoice_connections FOR INSERT
  WITH CHECK (auth.uid()::text = "userId");

CREATE POLICY "users can update own connections"
  ON invoice_connections FOR UPDATE
  USING (auth.uid()::text = "userId");

-- ---------------------------------------------------------------------------
-- schedules
-- ---------------------------------------------------------------------------
CREATE POLICY "users can view own schedule"
  ON schedules FOR SELECT
  USING (auth.uid()::text = "userId");

CREATE POLICY "users can insert own schedule"
  ON schedules FOR INSERT
  WITH CHECK (auth.uid()::text = "userId");

CREATE POLICY "users can update own schedule"
  ON schedules FOR UPDATE
  USING (auth.uid()::text = "userId");

-- ---------------------------------------------------------------------------
-- email_settings
-- ---------------------------------------------------------------------------
CREATE POLICY "users can view own email settings"
  ON email_settings FOR SELECT
  USING (auth.uid()::text = "userId");

CREATE POLICY "users can insert own email settings"
  ON email_settings FOR INSERT
  WITH CHECK (auth.uid()::text = "userId");

CREATE POLICY "users can update own email settings"
  ON email_settings FOR UPDATE
  USING (auth.uid()::text = "userId");

-- ---------------------------------------------------------------------------
-- tracked_invoices
-- ---------------------------------------------------------------------------
CREATE POLICY "users can view own invoices"
  ON tracked_invoices FOR SELECT
  USING (auth.uid()::text = "userId");

CREATE POLICY "users can insert own invoices"
  ON tracked_invoices FOR INSERT
  WITH CHECK (auth.uid()::text = "userId");

CREATE POLICY "users can update own invoices"
  ON tracked_invoices FOR UPDATE
  USING (auth.uid()::text = "userId");

-- ---------------------------------------------------------------------------
-- email_logs
-- ---------------------------------------------------------------------------
-- email_logs is accessed via tracked_invoice; use a join-based policy
CREATE POLICY "users can view own email logs"
  ON email_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM tracked_invoices
      WHERE tracked_invoices.id = email_logs."trackedInvoiceId"
        AND tracked_invoices."userId" = auth.uid()::text
    )
  );

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
CREATE POLICY "users can view own email templates"
  ON email_templates FOR SELECT
  USING (auth.uid()::text = "userId");

CREATE POLICY "users can insert own email templates"
  ON email_templates FOR INSERT
  WITH CHECK (auth.uid()::text = "userId");

CREATE POLICY "users can update own email templates"
  ON email_templates FOR UPDATE
  USING (auth.uid()::text = "userId");

CREATE POLICY "users can delete own email templates"
  ON email_templates FOR DELETE
  USING (auth.uid()::text = "userId");

-- ---------------------------------------------------------------------------
-- ai_usage_logs
-- Users may read their own rows. Inserts are performed by the application
-- via prismaAdmin (service role) only — no INSERT policy for users.
-- ---------------------------------------------------------------------------
ALTER TABLE ai_usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can view own AI usage logs"
  ON ai_usage_logs FOR SELECT
  USING (auth.uid()::text = user_id);

-- ---------------------------------------------------------------------------
-- accounting_connections
-- Users can read/write their own connections. Cron and webhook code uses
-- prismaAdmin (service role) which bypasses RLS by design.
-- ---------------------------------------------------------------------------
ALTER TABLE accounting_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can view own accounting connections"
  ON accounting_connections FOR SELECT
  USING (auth.uid()::text = "userId");

CREATE POLICY "users can insert own accounting connections"
  ON accounting_connections FOR INSERT
  WITH CHECK (auth.uid()::text = "userId");

CREATE POLICY "users can update own accounting connections"
  ON accounting_connections FOR UPDATE
  USING (auth.uid()::text = "userId");

CREATE POLICY "users can delete own accounting connections"
  ON accounting_connections FOR DELETE
  USING (auth.uid()::text = "userId");

-- ---------------------------------------------------------------------------
-- accounting_sync_runs
-- Users can read their own sync run history. Writes are performed by the
-- sync cron/manual route via prismaAdmin (service role).
-- ---------------------------------------------------------------------------
ALTER TABLE accounting_sync_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can view own sync runs"
  ON accounting_sync_runs FOR SELECT
  USING (auth.uid()::text = "userId");

-- No user INSERT/UPDATE policy — cron uses prismaAdmin (service role)

-- ---------------------------------------------------------------------------
-- provider_invoice_mappings
-- Accessed via trackedInvoice which belongs to userId. Users can read their
-- own mappings. Writes are performed by the sync orchestrator via prismaAdmin.
-- ---------------------------------------------------------------------------
ALTER TABLE provider_invoice_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can view own provider invoice mappings"
  ON provider_invoice_mappings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM tracked_invoices
      WHERE tracked_invoices.id = provider_invoice_mappings."tracked_invoice_id"
        AND tracked_invoices."userId" = auth.uid()::text
    )
  );

-- No user INSERT/UPDATE policy — sync orchestrator uses prismaAdmin (service role)

-- ---------------------------------------------------------------------------
-- provider_contact_mappings
-- Scoped via accounting_connections which belongs to userId.
-- ---------------------------------------------------------------------------
ALTER TABLE provider_contact_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can view own provider contact mappings"
  ON provider_contact_mappings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM accounting_connections
      WHERE accounting_connections.id = provider_contact_mappings."accounting_connection_id"
        AND accounting_connections."userId" = auth.uid()::text
    )
  );

-- No user INSERT/UPDATE policy — sync orchestrator uses prismaAdmin (service role)

-- ---------------------------------------------------------------------------
-- oauth_states
-- Short-lived CSRF nonces for OAuth callbacks. Users can read their own
-- states. Insert/delete is performed by the connect route (uses withUserContext).
-- Expired rows are cleaned up by the sync cron (prismaAdmin).
-- ---------------------------------------------------------------------------
ALTER TABLE oauth_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can view own oauth states"
  ON oauth_states FOR SELECT
  USING (auth.uid()::text = "userId");

CREATE POLICY "users can insert own oauth states"
  ON oauth_states FOR INSERT
  WITH CHECK (auth.uid()::text = "userId");

CREATE POLICY "users can delete own oauth states"
  ON oauth_states FOR DELETE
  USING (auth.uid()::text = "userId");

-- ---------------------------------------------------------------------------
-- promise_to_pay
-- Users can read their own promise records. Inserts and updates are
-- performed via prismaAdmin (service role): the public promise endpoint uses
-- prismaAdmin with userId sourced from the DB lookup, not the request body.
-- This is a documented RLS bypass — see design.md Decision #4.
-- ---------------------------------------------------------------------------
ALTER TABLE promise_to_pay ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can view own promises to pay"
  ON promise_to_pay FOR SELECT
  USING (auth.uid()::text = "user_id");

-- No user INSERT/UPDATE/DELETE policy — public endpoint and cron use
-- prismaAdmin (service role) which bypasses RLS by design.
