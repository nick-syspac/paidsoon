-- PaidSoon — accounting_connections RLS hotfix
--
-- Run in Supabase SQL Editor, or with:
--   psql "$DIRECT_URL" -f prisma/rls-accounting-connections-hotfix.sql
--
-- This file is intentionally narrow and idempotent. The canonical full policy
-- set remains prisma/rls-policies.sql, but that file is not safe to re-run
-- against a database that already has most policies installed.

BEGIN;

ALTER TABLE accounting_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users can view own accounting connections"
  ON accounting_connections;
DROP POLICY IF EXISTS "users can insert own accounting connections"
  ON accounting_connections;
DROP POLICY IF EXISTS "users can update own accounting connections"
  ON accounting_connections;
DROP POLICY IF EXISTS "users can delete own accounting connections"
  ON accounting_connections;

CREATE POLICY "users can view own accounting connections"
  ON accounting_connections FOR SELECT
  TO authenticated
  USING ((select auth.uid())::text = "userId");

CREATE POLICY "users can insert own accounting connections"
  ON accounting_connections FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid())::text = "userId");

CREATE POLICY "users can update own accounting connections"
  ON accounting_connections FOR UPDATE
  TO authenticated
  USING ((select auth.uid())::text = "userId")
  WITH CHECK ((select auth.uid())::text = "userId");

CREATE POLICY "users can delete own accounting connections"
  ON accounting_connections FOR DELETE
  TO authenticated
  USING ((select auth.uid())::text = "userId");

COMMIT;