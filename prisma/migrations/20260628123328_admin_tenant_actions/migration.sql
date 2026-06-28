-- AlterEnum
ALTER TYPE "AdminAuditAction" ADD VALUE 'admin_tenant_action';

-- AlterTable
ALTER TABLE "admin_audit_events" ADD COLUMN     "metadata" JSONB;
