-- Fix schema drift introduced by the account display rollout.
-- These fields are defined in Prisma but were not added to the live database tables.

ALTER TABLE "user_profiles"
  ADD COLUMN IF NOT EXISTS "account_display_from_date" DATE,
  ADD COLUMN IF NOT EXISTS "account_display_revision" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "account_display_time_zone" TEXT NOT NULL DEFAULT 'Australia/Melbourne';

ALTER TABLE "spend_insights"
  ADD COLUMN IF NOT EXISTS "account_display_revision" INTEGER,
  ADD COLUMN IF NOT EXISTS "account_display_from_date" DATE,
  ADD COLUMN IF NOT EXISTS "account_display_time_zone" TEXT;

ALTER TABLE "cash_plan_snapshots"
  ADD COLUMN IF NOT EXISTS "account_display_revision" INTEGER,
  ADD COLUMN IF NOT EXISTS "account_display_from_date" DATE,
  ADD COLUMN IF NOT EXISTS "account_display_time_zone" TEXT;

ALTER TABLE "cash_plan_alerts"
  ADD COLUMN IF NOT EXISTS "account_display_revision" INTEGER,
  ADD COLUMN IF NOT EXISTS "account_display_from_date" DATE,
  ADD COLUMN IF NOT EXISTS "account_display_time_zone" TEXT;

ALTER TABLE "cash_plan_data_quality_issues"
  ADD COLUMN IF NOT EXISTS "account_display_revision" INTEGER,
  ADD COLUMN IF NOT EXISTS "account_display_from_date" DATE,
  ADD COLUMN IF NOT EXISTS "account_display_time_zone" TEXT;

ALTER TABLE "commit_guard_evaluation_states"
  ADD COLUMN IF NOT EXISTS "account_display_revision" INTEGER,
  ADD COLUMN IF NOT EXISTS "account_display_from_date" DATE,
  ADD COLUMN IF NOT EXISTS "account_display_time_zone" TEXT;

ALTER TABLE "commitment_detection_candidates"
  ADD COLUMN IF NOT EXISTS "account_display_revision" INTEGER,
  ADD COLUMN IF NOT EXISTS "account_display_from_date" DATE,
  ADD COLUMN IF NOT EXISTS "account_display_time_zone" TEXT;
