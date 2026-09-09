-- CreateTable
CREATE TABLE "owners_digest_settings" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "email_enabled" BOOLEAN NOT NULL DEFAULT false,
    "frequency" TEXT NOT NULL DEFAULT 'weekly',
    "delivery_day" TEXT NOT NULL DEFAULT 'monday',
    "delivery_time" TEXT NOT NULL DEFAULT '07:00',
    "timezone" TEXT NOT NULL DEFAULT 'Australia/Sydney',
    "include_needs_attention" BOOLEAN NOT NULL DEFAULT true,
    "include_opportunities" BOOLEAN NOT NULL DEFAULT true,
    "include_positive_changes" BOOLEAN NOT NULL DEFAULT true,
    "include_key_numbers" BOOLEAN NOT NULL DEFAULT true,
    "max_action_items" INTEGER NOT NULL DEFAULT 5,
    "minimum_materiality_cents" INTEGER NOT NULL DEFAULT 10000,
    "send_when_empty" BOOLEAN NOT NULL DEFAULT true,
    "recipient_scope" TEXT NOT NULL DEFAULT 'owner_only',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owners_digest_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "owners_digest_snapshots" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "period_label" TEXT,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "summary_mode" TEXT NOT NULL DEFAULT 'deterministic',
    "data_as_of" TIMESTAMP(3),
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_regenerated_at" TIMESTAMP(3),
    "generation_source" TEXT NOT NULL DEFAULT 'scheduled',
    "generation_state" TEXT NOT NULL DEFAULT 'complete',
    "provider_success_count" INTEGER NOT NULL DEFAULT 0,
    "provider_failure_count" INTEGER NOT NULL DEFAULT 0,
    "provider_stale_count" INTEGER NOT NULL DEFAULT 0,
    "top_attention_count" INTEGER NOT NULL DEFAULT 0,
    "opportunity_count" INTEGER NOT NULL DEFAULT 0,
    "positive_count" INTEGER NOT NULL DEFAULT 0,
    "info_count" INTEGER NOT NULL DEFAULT 0,
    "completeness_status" TEXT NOT NULL DEFAULT 'complete',
    "completeness_summary" TEXT,
    "status_reason" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owners_digest_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "owners_digest_items" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "snapshot_id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "signal_type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "priority_score" INTEGER NOT NULL DEFAULT 0,
    "section" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "why_it_matters" TEXT,
    "financial_impact_cents" INTEGER,
    "current_value" DOUBLE PRECISION,
    "previous_value" DOUBLE PRECISION,
    "change_value" DOUBLE PRECISION,
    "change_percent" DOUBLE PRECISION,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "entity_name" TEXT,
    "recommended_action" TEXT,
    "action_url" TEXT,
    "contributing_sources" JSONB,
    "metadata" JSONB,
    "detected_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owners_digest_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "owners_digest_metrics" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "snapshot_id" TEXT NOT NULL,
    "metric_key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "section" TEXT,
    "unit" TEXT NOT NULL,
    "display_value" TEXT NOT NULL,
    "numeric_value" DOUBLE PRECISION,
    "monetary_value_cents" INTEGER,
    "previous_numeric_value" DOUBLE PRECISION,
    "previous_monetary_value_cents" INTEGER,
    "change_numeric_value" DOUBLE PRECISION,
    "change_monetary_value_cents" INTEGER,
    "change_percent" DOUBLE PRECISION,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owners_digest_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "owners_digest_provider_runs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "snapshot_id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "signal_count" INTEGER NOT NULL DEFAULT 0,
    "surfaced_count" INTEGER NOT NULL DEFAULT 0,
    "stale" BOOLEAN NOT NULL DEFAULT false,
    "entitled" BOOLEAN NOT NULL DEFAULT true,
    "configured" BOOLEAN NOT NULL DEFAULT true,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "data_as_of" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "duration_ms" INTEGER,
    "error_code" TEXT,
    "error_summary" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owners_digest_provider_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "owners_digest_deliveries" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "snapshot_id" TEXT NOT NULL,
    "delivery_scope" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'email',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "recipient_count" INTEGER NOT NULL DEFAULT 0,
    "delivery_key" TEXT NOT NULL,
    "message_id" TEXT,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "error_code" TEXT,
    "error_summary" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owners_digest_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "owners_digest_settings_user_id_key" ON "owners_digest_settings"("user_id");

-- CreateIndex
CREATE INDEX "owners_digest_snapshots_user_id_generated_at_idx" ON "owners_digest_snapshots"("user_id", "generated_at");

-- CreateIndex
CREATE INDEX "owners_digest_snapshots_user_id_status_generated_at_idx" ON "owners_digest_snapshots"("user_id", "status", "generated_at");

-- CreateIndex
CREATE UNIQUE INDEX "owners_digest_snapshots_user_id_frequency_period_start_peri_key" ON "owners_digest_snapshots"("user_id", "frequency", "period_start", "period_end");

-- CreateIndex
CREATE INDEX "owners_digest_items_user_id_source_severity_idx" ON "owners_digest_items"("user_id", "source", "severity");

-- CreateIndex
CREATE INDEX "owners_digest_items_snapshot_id_priority_score_idx" ON "owners_digest_items"("snapshot_id", "priority_score");

-- CreateIndex
CREATE UNIQUE INDEX "owners_digest_items_snapshot_id_section_sort_order_key" ON "owners_digest_items"("snapshot_id", "section", "sort_order");

-- CreateIndex
CREATE INDEX "owners_digest_metrics_user_id_metric_key_idx" ON "owners_digest_metrics"("user_id", "metric_key");

-- CreateIndex
CREATE INDEX "owners_digest_metrics_snapshot_id_sort_order_idx" ON "owners_digest_metrics"("snapshot_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "owners_digest_metrics_snapshot_id_metric_key_key" ON "owners_digest_metrics"("snapshot_id", "metric_key");

-- CreateIndex
CREATE INDEX "owners_digest_provider_runs_user_id_source_status_idx" ON "owners_digest_provider_runs"("user_id", "source", "status");

-- CreateIndex
CREATE UNIQUE INDEX "owners_digest_provider_runs_snapshot_id_source_key" ON "owners_digest_provider_runs"("snapshot_id", "source");

-- CreateIndex
CREATE INDEX "owners_digest_deliveries_snapshot_id_status_idx" ON "owners_digest_deliveries"("snapshot_id", "status");

-- CreateIndex
CREATE INDEX "owners_digest_deliveries_user_id_status_requested_at_idx" ON "owners_digest_deliveries"("user_id", "status", "requested_at");

-- CreateIndex
CREATE UNIQUE INDEX "owners_digest_deliveries_user_id_delivery_key_key" ON "owners_digest_deliveries"("user_id", "delivery_key");

-- AddForeignKey
ALTER TABLE "owners_digest_settings" ADD CONSTRAINT "owners_digest_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owners_digest_snapshots" ADD CONSTRAINT "owners_digest_snapshots_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owners_digest_items" ADD CONSTRAINT "owners_digest_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owners_digest_items" ADD CONSTRAINT "owners_digest_items_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "owners_digest_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owners_digest_metrics" ADD CONSTRAINT "owners_digest_metrics_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owners_digest_metrics" ADD CONSTRAINT "owners_digest_metrics_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "owners_digest_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owners_digest_provider_runs" ADD CONSTRAINT "owners_digest_provider_runs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owners_digest_provider_runs" ADD CONSTRAINT "owners_digest_provider_runs_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "owners_digest_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owners_digest_deliveries" ADD CONSTRAINT "owners_digest_deliveries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owners_digest_deliveries" ADD CONSTRAINT "owners_digest_deliveries_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "owners_digest_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
