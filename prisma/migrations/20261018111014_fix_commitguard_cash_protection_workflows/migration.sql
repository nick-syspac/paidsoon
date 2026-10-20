/*
  Warnings:

  - A unique constraint covering the columns `[user_id,id]` on the table `commitment_detection_candidates` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[user_id,candidate_key]` on the table `commitment_detection_candidates` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[user_id,id]` on the table `commitments` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[user_id,source_detection_candidate_id]` on the table `commitments` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[user_id,id]` on the table `tax_reserve_categories` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "cash_plan_overrides" ADD COLUMN     "planned_date" DATE;

-- AlterTable
ALTER TABLE "cash_plan_snapshots" ADD COLUMN     "anchor_date" DATE,
ADD COLUMN     "canonical_facts" JSONB,
ADD COLUMN     "cash_input_revision" INTEGER,
ADD COLUMN     "commitment_revision" INTEGER,
ADD COLUMN     "coverage" JSONB,
ADD COLUMN     "input_currency" TEXT,
ADD COLUMN     "input_quality" JSONB,
ADD COLUMN     "input_version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "commit_guard_settings" ADD COLUMN     "calculation_revision" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "safety_buffer_currency" TEXT;

-- AlterTable
ALTER TABLE "commitment_detection_candidates" ADD COLUMN     "candidate_key" TEXT,
ADD COLUMN     "connection_id" TEXT,
ADD COLUMN     "conversion_review_required" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "corrections_evidence_fingerprint" TEXT,
ADD COLUMN     "latest_observed_at" DATE,
ADD COLUMN     "recurrence_anchor" DATE,
ADD COLUMN     "suggested_due_date" DATE,
ADD COLUMN     "suppression_evidence" JSONB,
ADD COLUMN     "user_corrections" JSONB;

-- AlterTable
ALTER TABLE "commitment_events" ADD COLUMN     "cycle_key" TEXT,
ADD COLUMN     "input_revision" INTEGER,
ADD COLUMN     "occurrence_date" DATE,
ADD COLUMN     "relevance" TEXT NOT NULL DEFAULT 'historical',
ADD COLUMN     "resolved_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "commitments" ADD COLUMN     "source_detection_candidate_id" TEXT;

-- CreateTable
CREATE TABLE "commit_guard_cash_contexts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "amount_cents" INTEGER,
    "currency" TEXT,
    "balance_as_of" DATE,
    "weekly_operating_expenses_cents" INTEGER,
    "weekly_expenses_currency" TEXT,
    "weekly_expenses_as_of" DATE,
    "tax_protection_currency" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commit_guard_cash_contexts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commit_guard_work_items" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "source_kind" TEXT NOT NULL,
    "source_id" TEXT,
    "calculation_revision" INTEGER NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "generation" INTEGER NOT NULL DEFAULT 0,
    "attempt_history" JSONB,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "lease_owner" TEXT,
    "lease_expires_at" TIMESTAMP(3),
    "fence" INTEGER NOT NULL DEFAULT 0,
    "safe_error_code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commit_guard_work_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commit_guard_evaluation_states" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "last_evaluated_at" TIMESTAMP(3),
    "last_successful_daily_evaluation_at" TIMESTAMP(3),
    "calculation_revision" INTEGER,
    "cash_input_revision" INTEGER,
    "cash_risk_episode_id" TEXT,
    "cash_risk_status" TEXT,
    "cash_risk_relevance" TEXT,
    "cash_risk_resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commit_guard_evaluation_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commitment_coverages" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "commitment_id" TEXT NOT NULL,
    "occurrence_date" DATE NOT NULL,
    "currency" TEXT NOT NULL,
    "covered_cents" INTEGER NOT NULL,
    "target_kind" TEXT NOT NULL,
    "imported_bill_id" TEXT,
    "tax_reserve_category_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commitment_coverages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "commit_guard_cash_contexts_user_id_key" ON "commit_guard_cash_contexts"("user_id");

-- CreateIndex
CREATE INDEX "commit_guard_work_items_state_next_attempt_at_idx" ON "commit_guard_work_items"("state", "next_attempt_at");

-- CreateIndex
CREATE INDEX "commit_guard_work_items_state_lease_expires_at_idx" ON "commit_guard_work_items"("state", "lease_expires_at");

-- CreateIndex
CREATE INDEX "commit_guard_work_items_user_id_requested_at_idx" ON "commit_guard_work_items"("user_id", "requested_at");

-- CreateIndex
CREATE UNIQUE INDEX "commit_guard_work_items_user_id_kind_dedupe_key_key" ON "commit_guard_work_items"("user_id", "kind", "dedupe_key");

-- CreateIndex
CREATE UNIQUE INDEX "commit_guard_evaluation_states_user_id_key" ON "commit_guard_evaluation_states"("user_id");

-- CreateIndex
CREATE INDEX "commitment_coverages_user_id_occurrence_date_idx" ON "commitment_coverages"("user_id", "occurrence_date");

-- CreateIndex
CREATE UNIQUE INDEX "commitment_coverage_bill_unique" ON "commitment_coverages"("user_id", "commitment_id", "occurrence_date", "imported_bill_id");

-- CreateIndex
CREATE UNIQUE INDEX "commitment_coverage_tax_unique" ON "commitment_coverages"("user_id", "commitment_id", "occurrence_date", "tax_reserve_category_id");

-- CreateIndex
CREATE UNIQUE INDEX "commitment_detection_candidates_user_id_id_key" ON "commitment_detection_candidates"("user_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "commitment_detection_candidates_user_id_candidate_key_key" ON "commitment_detection_candidates"("user_id", "candidate_key");

-- CreateIndex
CREATE INDEX "commitment_events_user_id_relevance_occurred_at_idx" ON "commitment_events"("user_id", "relevance", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "commitments_user_id_id_key" ON "commitments"("user_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "commitments_user_id_source_detection_candidate_id_key" ON "commitments"("user_id", "source_detection_candidate_id");

-- CreateIndex
CREATE UNIQUE INDEX "tax_reserve_categories_user_id_id_key" ON "tax_reserve_categories"("user_id", "id");

-- AddForeignKey
ALTER TABLE "commit_guard_cash_contexts" ADD CONSTRAINT "commit_guard_cash_contexts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("userId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "commit_guard_work_items" ADD CONSTRAINT "commit_guard_work_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("userId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "commit_guard_evaluation_states" ADD CONSTRAINT "commit_guard_evaluation_states_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("userId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_user_id_source_detection_candidate_id_fkey" FOREIGN KEY ("user_id", "source_detection_candidate_id") REFERENCES "commitment_detection_candidates"("user_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "commitment_coverages" ADD CONSTRAINT "commitment_coverages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("userId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "commitment_coverages" ADD CONSTRAINT "commitment_coverages_user_id_commitment_id_fkey" FOREIGN KEY ("user_id", "commitment_id") REFERENCES "commitments"("user_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "commitment_coverages" ADD CONSTRAINT "commitment_coverages_user_id_imported_bill_id_fkey" FOREIGN KEY ("user_id", "imported_bill_id") REFERENCES "imported_bills"("user_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "commitment_coverages" ADD CONSTRAINT "commitment_coverages_user_id_tax_reserve_category_id_fkey" FOREIGN KEY ("user_id", "tax_reserve_category_id") REFERENCES "tax_reserve_categories"("user_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
