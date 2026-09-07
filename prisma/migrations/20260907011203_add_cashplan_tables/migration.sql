-- CreateTable
CREATE TABLE "cash_plans" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Base plan',
    "currency" TEXT NOT NULL DEFAULT 'aud',
    "timezone" TEXT NOT NULL DEFAULT 'Australia/Sydney',
    "horizon_weeks" INTEGER NOT NULL DEFAULT 13,
    "buffer_target_cents" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'preliminary',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_plan_settings" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "plan_id" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'aud',
    "timezone" TEXT NOT NULL DEFAULT 'Australia/Sydney',
    "horizon_weeks" INTEGER NOT NULL DEFAULT 13,
    "buffer_target_cents" INTEGER NOT NULL DEFAULT 0,
    "alert_threshold_cents" INTEGER NOT NULL DEFAULT 0,
    "review_role" TEXT NOT NULL DEFAULT 'owner',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_plan_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_plan_assumption_sets" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL DEFAULT 'default',
    "assumptions" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_plan_assumption_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_plan_scenarios" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'custom',
    "delta" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_plan_scenarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_plan_snapshots" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "scenario_id" TEXT,
    "input_hash" TEXT NOT NULL,
    "engine_version" TEXT NOT NULL,
    "confidence" INTEGER NOT NULL DEFAULT 100,
    "status" TEXT NOT NULL DEFAULT 'preliminary',
    "lowest_closing_cash_cents" INTEGER NOT NULL DEFAULT 0,
    "buffer_gap_cents" INTEGER NOT NULL DEFAULT 0,
    "weeks" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_plan_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_plan_overrides" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "amount_cents" INTEGER,
    "reason" TEXT NOT NULL,
    "owner" TEXT,
    "effective_from" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "source_type" TEXT NOT NULL DEFAULT 'manual',
    "source_id" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_plan_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_plan_alerts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "alert_type" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'medium',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "materiality_cents" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "triggered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledged_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_plan_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_plan_data_quality_issues" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "issue_type" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'medium',
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "week_index" INTEGER,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_plan_data_quality_issues_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cash_plans_user_id_status_idx" ON "cash_plans"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "cash_plan_settings_user_id_plan_id_key" ON "cash_plan_settings"("user_id", "plan_id");

-- CreateIndex
CREATE INDEX "cash_plan_assumption_sets_plan_id_version_idx" ON "cash_plan_assumption_sets"("plan_id", "version");

-- CreateIndex
CREATE INDEX "cash_plan_scenarios_plan_id_kind_idx" ON "cash_plan_scenarios"("plan_id", "kind");

-- CreateIndex
CREATE INDEX "cash_plan_snapshots_plan_id_created_at_idx" ON "cash_plan_snapshots"("plan_id", "created_at");

-- CreateIndex
CREATE INDEX "cash_plan_overrides_plan_id_entity_type_entity_id_idx" ON "cash_plan_overrides"("plan_id", "entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "cash_plan_alerts_plan_id_status_severity_idx" ON "cash_plan_alerts"("plan_id", "status", "severity");

-- CreateIndex
CREATE INDEX "cash_plan_data_quality_issues_plan_id_status_severity_idx" ON "cash_plan_data_quality_issues"("plan_id", "status", "severity");

-- AddForeignKey
ALTER TABLE "cash_plans" ADD CONSTRAINT "cash_plans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_plan_settings" ADD CONSTRAINT "cash_plan_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_plan_settings" ADD CONSTRAINT "cash_plan_settings_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "cash_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_plan_assumption_sets" ADD CONSTRAINT "cash_plan_assumption_sets_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "cash_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_plan_scenarios" ADD CONSTRAINT "cash_plan_scenarios_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "cash_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_plan_snapshots" ADD CONSTRAINT "cash_plan_snapshots_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "cash_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_plan_snapshots" ADD CONSTRAINT "cash_plan_snapshots_scenario_id_fkey" FOREIGN KEY ("scenario_id") REFERENCES "cash_plan_scenarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_plan_overrides" ADD CONSTRAINT "cash_plan_overrides_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "cash_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_plan_alerts" ADD CONSTRAINT "cash_plan_alerts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_plan_alerts" ADD CONSTRAINT "cash_plan_alerts_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "cash_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_plan_data_quality_issues" ADD CONSTRAINT "cash_plan_data_quality_issues_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_plan_data_quality_issues" ADD CONSTRAINT "cash_plan_data_quality_issues_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "cash_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
