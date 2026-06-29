-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AdminAuditAction" ADD VALUE 'customer_search';
ALTER TYPE "AdminAuditAction" ADD VALUE 'impersonate_start';
ALTER TYPE "AdminAuditAction" ADD VALUE 'impersonate_end';
ALTER TYPE "AdminAuditAction" ADD VALUE 'impersonate_timeout';
ALTER TYPE "AdminAuditAction" ADD VALUE 'impersonate_conflict';
ALTER TYPE "AdminAuditAction" ADD VALUE 'update_schedule';
ALTER TYPE "AdminAuditAction" ADD VALUE 'pause_invoices';
ALTER TYPE "AdminAuditAction" ADD VALUE 'resume_invoices';
ALTER TYPE "AdminAuditAction" ADD VALUE 'trigger_email';
ALTER TYPE "AdminAuditAction" ADD VALUE 'mark_invoice_paid';

-- AlterTable
ALTER TABLE "admin_audit_events" ADD COLUMN     "admin_session_id" TEXT,
ADD COLUMN     "details" JSONB,
ADD COLUMN     "resource_id" TEXT,
ADD COLUMN     "target_user_id" TEXT;

-- AlterTable
ALTER TABLE "admin_sessions" ADD COLUMN     "action_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "duration" INTEGER,
ADD COLUMN     "ended_at" TIMESTAMP(3),
ADD COLUMN     "impersonated_user_id" TEXT,
ADD COLUMN     "notify_customer" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "audit_retention_logs" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "records_archived" INTEGER NOT NULL,
    "s3_path" TEXT,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_retention_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_retention_logs_timestamp_idx" ON "audit_retention_logs"("timestamp");

-- CreateIndex
CREATE INDEX "audit_retention_logs_success_idx" ON "audit_retention_logs"("success");

-- CreateIndex
CREATE INDEX "admin_audit_events_admin_session_id_idx" ON "admin_audit_events"("admin_session_id");

-- CreateIndex
CREATE INDEX "admin_audit_events_target_user_id_created_at_idx" ON "admin_audit_events"("target_user_id", "created_at");

-- CreateIndex
CREATE INDEX "admin_sessions_impersonated_user_id_started_at_idx" ON "admin_sessions"("impersonated_user_id", "started_at");

-- AddForeignKey
ALTER TABLE "admin_audit_events" ADD CONSTRAINT "admin_audit_events_admin_session_id_fkey" FOREIGN KEY ("admin_session_id") REFERENCES "admin_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
