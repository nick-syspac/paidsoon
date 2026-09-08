-- CreateTable
CREATE TABLE "commit_guard_settings" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "default_horizon_days" INTEGER NOT NULL DEFAULT 30,
    "safety_buffer_mode" TEXT NOT NULL DEFAULT 'fixed_amount',
    "safety_buffer_fixed_cents" INTEGER NOT NULL DEFAULT 0,
    "safety_buffer_percent" DOUBLE PRECISION,
    "safety_buffer_weeks" DOUBLE PRECISION,
    "detect_recurring_commitments" BOOLEAN NOT NULL DEFAULT false,
    "detection_min_occurrences" INTEGER NOT NULL DEFAULT 3,
    "detection_amount_variance_percent" DOUBLE PRECISION NOT NULL DEFAULT 12,
    "detection_interval_tolerance_days" INTEGER NOT NULL DEFAULT 3,
    "detection_confidence_threshold" TEXT NOT NULL DEFAULT 'medium',
    "alert_commitment_due_soon" BOOLEAN NOT NULL DEFAULT true,
    "alert_renewal_approaching" BOOLEAN NOT NULL DEFAULT true,
    "alert_notice_period_approaching" BOOLEAN NOT NULL DEFAULT true,
    "alert_commitment_amount_changed" BOOLEAN NOT NULL DEFAULT true,
    "alert_commitment_buffer_low" BOOLEAN NOT NULL DEFAULT true,
    "alert_commitment_shortfall" BOOLEAN NOT NULL DEFAULT true,
    "renewal_warning_days" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commit_guard_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commitments" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "next_due_date" TIMESTAMP(3),
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "recurrence_rule" JSONB,
    "supplier_name" TEXT,
    "supplier_id" TEXT,
    "account_id" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "status" TEXT NOT NULL DEFAULT 'active',
    "confidence" TEXT NOT NULL DEFAULT 'confirmed',
    "notice_period_days" INTEGER,
    "renewal_date" TIMESTAMP(3),
    "auto_renew" BOOLEAN NOT NULL DEFAULT false,
    "cancellable" BOOLEAN NOT NULL DEFAULT true,
    "essentiality" TEXT NOT NULL DEFAULT 'operational',
    "notes" TEXT,
    "linked_spend_insight_id" TEXT,
    "linked_cost_guard_alert_id" TEXT,
    "paused_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "expired_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commitments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commitment_detection_candidates" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "supplier_name" TEXT,
    "supplier_id" TEXT,
    "category" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "typical_amount_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'system_inferred',
    "confidence" TEXT NOT NULL DEFAULT 'medium',
    "confidence_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "evidence" JSONB,
    "evidence_fingerprint" TEXT,
    "rejection_evidence_fingerprint" TEXT,
    "first_detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "next_suggested_at" TIMESTAMP(3),
    "review_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commitment_detection_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commitment_events" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "commitment_id" TEXT,
    "detection_candidate_id" TEXT,
    "event_type" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'info',
    "dedupe_key" TEXT,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "actor_id" TEXT,
    "metadata" JSONB,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commitment_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "commit_guard_settings_user_id_key" ON "commit_guard_settings"("user_id");

-- CreateIndex
CREATE INDEX "commitments_user_id_next_due_date_idx" ON "commitments"("user_id", "next_due_date");

-- CreateIndex
CREATE INDEX "commitments_user_id_status_idx" ON "commitments"("user_id", "status");

-- CreateIndex
CREATE INDEX "commitments_user_id_renewal_date_idx" ON "commitments"("user_id", "renewal_date");

-- CreateIndex
CREATE INDEX "commitments_user_id_source_idx" ON "commitments"("user_id", "source");

-- CreateIndex
CREATE INDEX "commitments_user_id_confidence_idx" ON "commitments"("user_id", "confidence");

-- CreateIndex
CREATE INDEX "commitments_user_id_supplier_id_idx" ON "commitments"("user_id", "supplier_id");

-- CreateIndex
CREATE INDEX "commitment_detection_candidates_user_id_status_last_detecte_idx" ON "commitment_detection_candidates"("user_id", "status", "last_detected_at");

-- CreateIndex
CREATE INDEX "commitment_detection_candidates_user_id_source_idx" ON "commitment_detection_candidates"("user_id", "source");

-- CreateIndex
CREATE INDEX "commitment_detection_candidates_user_id_supplier_id_idx" ON "commitment_detection_candidates"("user_id", "supplier_id");

-- CreateIndex
CREATE INDEX "commitment_events_user_id_occurred_at_idx" ON "commitment_events"("user_id", "occurred_at");

-- CreateIndex
CREATE INDEX "commitment_events_commitment_id_occurred_at_idx" ON "commitment_events"("commitment_id", "occurred_at");

-- CreateIndex
CREATE INDEX "commitment_events_detection_candidate_id_occurred_at_idx" ON "commitment_events"("detection_candidate_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "commitment_events_user_id_dedupe_key_key" ON "commitment_events"("user_id", "dedupe_key");

-- AddForeignKey
ALTER TABLE "commit_guard_settings" ADD CONSTRAINT "commit_guard_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commitment_detection_candidates" ADD CONSTRAINT "commitment_detection_candidates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commitment_events" ADD CONSTRAINT "commitment_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commitment_events" ADD CONSTRAINT "commitment_events_commitment_id_fkey" FOREIGN KEY ("commitment_id") REFERENCES "commitments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commitment_events" ADD CONSTRAINT "commitment_events_detection_candidate_id_fkey" FOREIGN KEY ("detection_candidate_id") REFERENCES "commitment_detection_candidates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
