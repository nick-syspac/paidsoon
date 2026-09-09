-- CreateTable
CREATE TABLE "runway_guard_settings" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "horizon_days" INTEGER NOT NULL DEFAULT 180,
    "warning_threshold_days" INTEGER NOT NULL DEFAULT 90,
    "critical_threshold_days" INTEGER NOT NULL DEFAULT 45,
    "low_confidence_weight" DOUBLE PRECISION NOT NULL DEFAULT 0.6,
    "minimum_confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "alert_on_breach" BOOLEAN NOT NULL DEFAULT true,
    "alert_on_recovery" BOOLEAN NOT NULL DEFAULT true,
    "notification_digest_mode" TEXT NOT NULL DEFAULT 'daily',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "runway_guard_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "runway_guard_snapshots" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "snapshot_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "opening_cash_cents" INTEGER NOT NULL DEFAULT 0,
    "protected_cash_cents" INTEGER NOT NULL DEFAULT 0,
    "usable_cash_cents" INTEGER NOT NULL DEFAULT 0,
    "runway_days" INTEGER NOT NULL DEFAULT 0,
    "projected_exhaustion_day" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'watch',
    "source" TEXT NOT NULL DEFAULT 'cashplan',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "assumptions" JSONB,
    "explainability" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "runway_guard_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "runway_guard_alerts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "runway_snapshot_id" TEXT,
    "alert_type" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'warning',
    "status" TEXT NOT NULL DEFAULT 'open',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "materiality_cents" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "triggered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledged_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "runway_guard_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "runway_guard_alert_events" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "runway_alert_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "actor_id" TEXT,
    "old_status" TEXT,
    "new_status" TEXT,
    "reason" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "runway_guard_alert_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "runway_guard_scenarios" (
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

    CONSTRAINT "runway_guard_scenarios_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "runway_guard_settings_user_id_key" ON "runway_guard_settings"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "runway_guard_snapshots_user_id_snapshot_at_key" ON "runway_guard_snapshots"("user_id", "snapshot_at");
CREATE INDEX "runway_guard_snapshots_user_id_snapshot_at_idx" ON "runway_guard_snapshots"("user_id", "snapshot_at");
CREATE INDEX "runway_guard_snapshots_user_id_status_idx" ON "runway_guard_snapshots"("user_id", "status");

-- CreateIndex
CREATE INDEX "runway_guard_alerts_user_id_status_severity_idx" ON "runway_guard_alerts"("user_id", "status", "severity");
CREATE INDEX "runway_guard_alerts_user_id_alert_type_triggered_at_idx" ON "runway_guard_alerts"("user_id", "alert_type", "triggered_at");

-- CreateIndex
CREATE INDEX "runway_guard_alert_events_runway_alert_id_created_at_idx" ON "runway_guard_alert_events"("runway_alert_id", "created_at");
CREATE INDEX "runway_guard_alert_events_user_id_created_at_idx" ON "runway_guard_alert_events"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "runway_guard_scenarios_user_id_scenario_type_idx" ON "runway_guard_scenarios"("user_id", "scenario_type");
CREATE INDEX "runway_guard_scenarios_user_id_created_at_idx" ON "runway_guard_scenarios"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "runway_guard_settings" ADD CONSTRAINT "runway_guard_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runway_guard_snapshots" ADD CONSTRAINT "runway_guard_snapshots_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runway_guard_alerts" ADD CONSTRAINT "runway_guard_alerts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "runway_guard_alerts" ADD CONSTRAINT "runway_guard_alerts_runway_snapshot_id_fkey" FOREIGN KEY ("runway_snapshot_id") REFERENCES "runway_guard_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runway_guard_alert_events" ADD CONSTRAINT "runway_guard_alert_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "runway_guard_alert_events" ADD CONSTRAINT "runway_guard_alert_events_runway_alert_id_fkey" FOREIGN KEY ("runway_alert_id") REFERENCES "runway_guard_alerts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runway_guard_scenarios" ADD CONSTRAINT "runway_guard_scenarios_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
