-- Invoice Nudge — Supabase Row Level Security Policies
-- Run this in Supabase SQL Editor after running Prisma migrations.
-- These policies ensure strict tenant isolation: users can only access their own data.

-- Enable RLS on all application tables
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracked_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;

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
  WITH CHECK (true); -- Cron job uses service role key; RLS bypassed for inserts
