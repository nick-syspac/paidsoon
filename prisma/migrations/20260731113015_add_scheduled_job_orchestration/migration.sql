-- CreateTable
CREATE TABLE "scheduled_task_claims" (
    "id" TEXT NOT NULL,
    "workflow" TEXT NOT NULL,
    "claim_key" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "user_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "scheduled_for" TIMESTAMP(3) NOT NULL,
    "claimed_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduled_task_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispatcher_heartbeats" (
    "id" TEXT NOT NULL,
    "dispatcher" TEXT NOT NULL,
    "last_run_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dispatcher_heartbeats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "scheduled_task_claims_claim_key_key" ON "scheduled_task_claims"("claim_key");

-- CreateIndex
CREATE INDEX "scheduled_task_claims_status_scheduled_for_idx" ON "scheduled_task_claims"("status", "scheduled_for");

-- CreateIndex
CREATE INDEX "scheduled_task_claims_workflow_status_idx" ON "scheduled_task_claims"("workflow", "status");

-- CreateIndex
CREATE UNIQUE INDEX "dispatcher_heartbeats_dispatcher_key" ON "dispatcher_heartbeats"("dispatcher");
