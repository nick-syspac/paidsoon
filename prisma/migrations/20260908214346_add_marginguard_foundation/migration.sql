-- CreateTable
CREATE TABLE "margin_guard_settings" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "default_period" TEXT NOT NULL DEFAULT '30d',
    "target_gross_margin_percent" DOUBLE PRECISION NOT NULL DEFAULT 35,
    "warning_gross_margin_percent" DOUBLE PRECISION NOT NULL DEFAULT 30,
    "critical_gross_margin_percent" DOUBLE PRECISION NOT NULL DEFAULT 25,
    "min_completeness_percent" DOUBLE PRECISION NOT NULL DEFAULT 70,
    "high_confidence_percent" DOUBLE PRECISION NOT NULL DEFAULT 90,
    "medium_confidence_percent" DOUBLE PRECISION NOT NULL DEFAULT 75,
    "low_confidence_percent" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "alert_below_warning" BOOLEAN NOT NULL DEFAULT true,
    "alert_below_critical" BOOLEAN NOT NULL DEFAULT true,
    "alert_deterioration" BOOLEAN NOT NULL DEFAULT true,
    "alert_negative_margin" BOOLEAN NOT NULL DEFAULT true,
    "alert_customer_margin_warning" BOOLEAN NOT NULL DEFAULT true,
    "alert_cost_increase" BOOLEAN NOT NULL DEFAULT true,
    "alert_data_quality_warning" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "margin_guard_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "margin_guard_targets" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "scope_type" TEXT NOT NULL,
    "scope_key" TEXT,
    "target_gross_margin_percent" DOUBLE PRECISION NOT NULL,
    "warning_gross_margin_percent" DOUBLE PRECISION,
    "critical_gross_margin_percent" DOUBLE PRECISION,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "margin_guard_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "margin_classification_rules" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rule_type" TEXT NOT NULL,
    "classification" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "match_config" JSONB NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "margin_classification_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "margin_cost_classifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_record_id" TEXT NOT NULL,
    "classification" TEXT NOT NULL,
    "classification_origin" TEXT NOT NULL DEFAULT 'default',
    "confidence" TEXT NOT NULL DEFAULT 'medium',
    "override_locked" BOOLEAN NOT NULL DEFAULT false,
    "margin_classification_rule_id" TEXT,
    "imported_bill_id" TEXT,
    "imported_bank_transaction_id" TEXT,
    "financial_invoice_id" TEXT,
    "metadata" JSONB,
    "created_by" TEXT,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "margin_cost_classifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "margin_snapshots" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "period_granularity" TEXT NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL,
    "revenue_cents" INTEGER NOT NULL DEFAULT 0,
    "direct_cost_cents" INTEGER NOT NULL DEFAULT 0,
    "variable_cost_cents" INTEGER NOT NULL DEFAULT 0,
    "gross_profit_cents" INTEGER NOT NULL DEFAULT 0,
    "gross_margin_percent" DOUBLE PRECISION,
    "contribution_margin_cents" INTEGER,
    "contribution_margin_percent" DOUBLE PRECISION,
    "completeness_percent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confidence" TEXT NOT NULL DEFAULT 'insufficient_data',
    "status" TEXT NOT NULL DEFAULT 'insufficient_data',
    "assumptions" JSONB,
    "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "margin_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "margin_alerts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "margin_snapshot_id" TEXT,
    "alert_type" TEXT NOT NULL,
    "scope_type" TEXT NOT NULL,
    "scope_key" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'warning',
    "status" TEXT NOT NULL DEFAULT 'open',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "evidence" JSONB,
    "estimated_impact_cents" INTEGER,
    "confidence" TEXT NOT NULL DEFAULT 'medium',
    "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledged_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "dismissed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "margin_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "margin_alert_events" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "margin_alert_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "actor_id" TEXT,
    "old_status" TEXT,
    "new_status" TEXT,
    "reason" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "margin_alert_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "margin_scenarios" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scenario_type" TEXT NOT NULL,
    "inputs" JSONB NOT NULL,
    "outputs" JSONB NOT NULL,
    "assumptions" JSONB,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "margin_scenarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "margin_opportunities" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "opportunity_type" TEXT NOT NULL,
    "scope_type" TEXT NOT NULL,
    "scope_key" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'warning',
    "status" TEXT NOT NULL DEFAULT 'open',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "evidence" JSONB,
    "estimated_monthly_cents" INTEGER,
    "estimated_annual_cents" INTEGER,
    "confidence" TEXT NOT NULL DEFAULT 'medium',
    "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "margin_opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "margin_guard_settings_user_id_key" ON "margin_guard_settings"("user_id");

-- CreateIndex
CREATE INDEX "margin_guard_targets_user_id_scope_type_is_active_idx" ON "margin_guard_targets"("user_id", "scope_type", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "margin_guard_targets_user_id_scope_type_scope_key_key" ON "margin_guard_targets"("user_id", "scope_type", "scope_key");

-- CreateIndex
CREATE INDEX "margin_classification_rules_user_id_enabled_priority_idx" ON "margin_classification_rules"("user_id", "enabled", "priority");

-- CreateIndex
CREATE INDEX "margin_classification_rules_user_id_rule_type_idx" ON "margin_classification_rules"("user_id", "rule_type");

-- CreateIndex
CREATE INDEX "margin_cost_classifications_user_id_classification_idx" ON "margin_cost_classifications"("user_id", "classification");

-- CreateIndex
CREATE INDEX "margin_cost_classifications_user_id_source_type_idx" ON "margin_cost_classifications"("user_id", "source_type");

-- CreateIndex
CREATE INDEX "margin_cost_classifications_margin_classification_rule_id_idx" ON "margin_cost_classifications"("margin_classification_rule_id");

-- CreateIndex
CREATE UNIQUE INDEX "margin_cost_classifications_user_id_source_type_source_reco_key" ON "margin_cost_classifications"("user_id", "source_type", "source_record_id");

-- CreateIndex
CREATE INDEX "margin_snapshots_user_id_period_start_idx" ON "margin_snapshots"("user_id", "period_start");

-- CreateIndex
CREATE INDEX "margin_snapshots_user_id_status_idx" ON "margin_snapshots"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "margin_snapshots_user_id_period_granularity_period_start_pe_key" ON "margin_snapshots"("user_id", "period_granularity", "period_start", "period_end");

-- CreateIndex
CREATE INDEX "margin_alerts_user_id_status_severity_idx" ON "margin_alerts"("user_id", "status", "severity");

-- CreateIndex
CREATE INDEX "margin_alerts_user_id_alert_type_detected_at_idx" ON "margin_alerts"("user_id", "alert_type", "detected_at");

-- CreateIndex
CREATE INDEX "margin_alert_events_margin_alert_id_created_at_idx" ON "margin_alert_events"("margin_alert_id", "created_at");

-- CreateIndex
CREATE INDEX "margin_alert_events_user_id_created_at_idx" ON "margin_alert_events"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "margin_scenarios_user_id_scenario_type_idx" ON "margin_scenarios"("user_id", "scenario_type");

-- CreateIndex
CREATE INDEX "margin_scenarios_user_id_created_at_idx" ON "margin_scenarios"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "margin_opportunities_user_id_status_severity_idx" ON "margin_opportunities"("user_id", "status", "severity");

-- CreateIndex
CREATE INDEX "margin_opportunities_user_id_opportunity_type_detected_at_idx" ON "margin_opportunities"("user_id", "opportunity_type", "detected_at");

-- AddForeignKey
ALTER TABLE "margin_guard_settings" ADD CONSTRAINT "margin_guard_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "margin_guard_targets" ADD CONSTRAINT "margin_guard_targets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "margin_classification_rules" ADD CONSTRAINT "margin_classification_rules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "margin_cost_classifications" ADD CONSTRAINT "margin_cost_classifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "margin_cost_classifications" ADD CONSTRAINT "margin_cost_classifications_margin_classification_rule_id_fkey" FOREIGN KEY ("margin_classification_rule_id") REFERENCES "margin_classification_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "margin_cost_classifications" ADD CONSTRAINT "margin_cost_classifications_imported_bill_id_fkey" FOREIGN KEY ("imported_bill_id") REFERENCES "imported_bills"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "margin_cost_classifications" ADD CONSTRAINT "margin_cost_classifications_imported_bank_transaction_id_fkey" FOREIGN KEY ("imported_bank_transaction_id") REFERENCES "imported_bank_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "margin_cost_classifications" ADD CONSTRAINT "margin_cost_classifications_financial_invoice_id_fkey" FOREIGN KEY ("financial_invoice_id") REFERENCES "financial_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "margin_snapshots" ADD CONSTRAINT "margin_snapshots_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "margin_alerts" ADD CONSTRAINT "margin_alerts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "margin_alerts" ADD CONSTRAINT "margin_alerts_margin_snapshot_id_fkey" FOREIGN KEY ("margin_snapshot_id") REFERENCES "margin_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "margin_alert_events" ADD CONSTRAINT "margin_alert_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "margin_alert_events" ADD CONSTRAINT "margin_alert_events_margin_alert_id_fkey" FOREIGN KEY ("margin_alert_id") REFERENCES "margin_alerts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "margin_scenarios" ADD CONSTRAINT "margin_scenarios_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "margin_opportunities" ADD CONSTRAINT "margin_opportunities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
