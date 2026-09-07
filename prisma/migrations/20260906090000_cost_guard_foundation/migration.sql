-- CreateTable
CREATE TABLE "cost_guard_settings" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "default_lookback_days" INTEGER NOT NULL DEFAULT 180,
    "materiality_percent" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "materiality_cents" INTEGER NOT NULL DEFAULT 10000,
    "alert_digest_mode" TEXT NOT NULL DEFAULT 'daily',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cost_guard_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_guard_rules" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rule_type" TEXT NOT NULL,
    "supplier_id" TEXT,
    "category_id" TEXT,
    "percentage_threshold" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "absolute_threshold_cents" INTEGER NOT NULL DEFAULT 10000,
    "severity" TEXT NOT NULL DEFAULT 'warning',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cost_guard_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_guard_baselines" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "baseline_type" TEXT NOT NULL,
    "supplier_id" TEXT,
    "category_id" TEXT,
    "period_months" INTEGER NOT NULL,
    "average_amount_cents" INTEGER NOT NULL,
    "median_amount_cents" INTEGER NOT NULL,
    "min_amount_cents" INTEGER NOT NULL,
    "max_amount_cents" INTEGER NOT NULL,
    "sample_count" INTEGER NOT NULL DEFAULT 0,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cost_guard_baselines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_guard_alerts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "alert_type" TEXT NOT NULL,
    "supplier_id" TEXT,
    "category_id" TEXT,
    "transaction_id" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'warning',
    "score" INTEGER NOT NULL DEFAULT 0,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "baseline_amount_cents" INTEGER NOT NULL,
    "actual_amount_cents" INTEGER NOT NULL,
    "variance_amount_cents" INTEGER NOT NULL,
    "variance_percent" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'new',
    "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledged_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cost_guard_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_guard_alert_events" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "alert_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "actor_id" TEXT,
    "reason" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cost_guard_alert_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_guard_forecasts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "forecast_month" TIMESTAMP(3) NOT NULL,
    "actual_spend_cents" INTEGER NOT NULL,
    "recurring_commitments_cents" INTEGER NOT NULL,
    "expected_variable_spend_cents" INTEGER NOT NULL,
    "projected_month_end_cents" INTEGER NOT NULL,
    "variance_amount_cents" INTEGER NOT NULL,
    "variance_percent" DOUBLE PRECISION NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "assumptions" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cost_guard_forecasts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cost_guard_settings_user_id_key" ON "cost_guard_settings"("user_id");

-- CreateIndex
CREATE INDEX "cost_guard_rules_user_id_rule_type_idx" ON "cost_guard_rules"("user_id", "rule_type");

-- CreateIndex
CREATE INDEX "cost_guard_baselines_user_id_baseline_type_supplier_id_idx" ON "cost_guard_baselines"("user_id", "baseline_type", "supplier_id");
CREATE INDEX "cost_guard_baselines_user_id_baseline_type_category_id_idx" ON "cost_guard_baselines"("user_id", "baseline_type", "category_id");

-- CreateIndex
CREATE INDEX "cost_guard_alerts_user_id_status_detected_at_idx" ON "cost_guard_alerts"("user_id", "status", "detected_at");

-- CreateIndex
CREATE INDEX "cost_guard_alert_events_alert_id_created_at_idx" ON "cost_guard_alert_events"("alert_id", "created_at");

-- CreateIndex
CREATE INDEX "cost_guard_forecasts_user_id_forecast_month_idx" ON "cost_guard_forecasts"("user_id", "forecast_month");

-- AddForeignKey
ALTER TABLE "cost_guard_settings" ADD CONSTRAINT "cost_guard_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_guard_rules" ADD CONSTRAINT "cost_guard_rules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_guard_baselines" ADD CONSTRAINT "cost_guard_baselines_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_guard_alerts" ADD CONSTRAINT "cost_guard_alerts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_guard_alert_events" ADD CONSTRAINT "cost_guard_alert_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "cost_guard_alert_events" ADD CONSTRAINT "cost_guard_alert_events_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "cost_guard_alerts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_guard_forecasts" ADD CONSTRAINT "cost_guard_forecasts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
