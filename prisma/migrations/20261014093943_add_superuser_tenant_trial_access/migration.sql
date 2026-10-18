-- CreateEnum
CREATE TYPE "TenantTrialPlan" AS ENUM ('essentials', 'business_control', 'small_business', 'business_pro');

-- CreateEnum
CREATE TYPE "TenantTrialAction" AS ENUM ('extend_or_grant', 'revoke_grant');

-- CreateEnum
CREATE TYPE "TenantTrialMutationSource" AS ENUM ('stripe_trial', 'admin_grant');

-- CreateEnum
CREATE TYPE "TenantTrialOperationStatus" AS ENUM ('previewed', 'pending', 'reconciliation_required', 'succeeded', 'failed', 'conflicted', 'expired_preview');

-- CreateEnum
CREATE TYPE "TenantTrialNotificationStatus" AS ENUM ('not_requested', 'pending', 'sending', 'sent', 'failed', 'unknown', 'blocked', 'superseded');

-- CreateEnum
CREATE TYPE "TenantBillingRiskKind" AS ENUM ('subscription_invoice', 'subscription_dispute');

-- AlterTable
ALTER TABLE "user_profiles" ADD COLUMN     "billing_access_version" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pending_trial_operation_id" UUID;

-- CreateTable
CREATE TABLE "tenant_trial_grants" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "plan" "TenantTrialPlan" NOT NULL,
    "starts_at" TIMESTAMPTZ(0) NOT NULL,
    "expires_at" TIMESTAMPTZ(0) NOT NULL,
    "revoked_at" TIMESTAMPTZ(0),
    "creator_operation_id" UUID NOT NULL,
    "last_operation_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(0) NOT NULL,

    CONSTRAINT "tenant_trial_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_trial_operations" (
    "id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "admin_session_id" TEXT NOT NULL,
    "input_hash" TEXT NOT NULL,
    "normalized_input" JSONB NOT NULL,
    "action" "TenantTrialAction" NOT NULL,
    "source" "TenantTrialMutationSource" NOT NULL,
    "previous_snapshot" JSONB NOT NULL,
    "previous_plan" TEXT,
    "previous_expires_at" TIMESTAMPTZ(0),
    "target_plan" "TenantTrialPlan",
    "target_expires_at" TIMESTAMPTZ(0),
    "reason" TEXT NOT NULL,
    "notify" BOOLEAN NOT NULL DEFAULT false,
    "time_zone" TEXT NOT NULL,
    "preview_version" INTEGER NOT NULL,
    "preview_fingerprint" TEXT NOT NULL,
    "preview_expires_at" TIMESTAMPTZ(0) NOT NULL,
    "status" "TenantTrialOperationStatus" NOT NULL DEFAULT 'previewed',
    "stripe_customer_id" TEXT,
    "stripe_subscription_id" TEXT,
    "stripe_request_id" TEXT,
    "stripe_idempotency_key" TEXT,
    "provider_result" JSONB,
    "result" JSONB,
    "failure_code" TEXT,
    "failure_summary" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "first_attempt_at" TIMESTAMPTZ(3),
    "last_attempt_at" TIMESTAMPTZ(3),
    "lease_owner" TEXT,
    "lease_expires_at" TIMESTAMPTZ(3),
    "fencing_token" INTEGER NOT NULL DEFAULT 0,
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tenant_trial_operations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_trial_notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "operation_id" UUID NOT NULL,
    "recipient_email" TEXT,
    "recipient_name" TEXT,
    "contact_source" TEXT,
    "rendered_payload" JSONB,
    "status" "TenantTrialNotificationStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "first_attempt_at" TIMESTAMPTZ(3),
    "last_attempt_at" TIMESTAMPTZ(3),
    "provider_message_id" TEXT,
    "provider_idempotency_key" TEXT NOT NULL,
    "failure_code" TEXT,
    "failure_summary" TEXT,
    "lease_owner" TEXT,
    "lease_expires_at" TIMESTAMPTZ(3),
    "fencing_token" INTEGER NOT NULL DEFAULT 0,
    "sent_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tenant_trial_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_billing_risks" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "kind" "TenantBillingRiskKind" NOT NULL,
    "stripe_object_id" TEXT NOT NULL,
    "stripe_customer_id" TEXT NOT NULL,
    "stripe_subscription_id" TEXT NOT NULL,
    "stripe_charge_id" TEXT,
    "stripe_invoice_id" TEXT,
    "stripe_status" TEXT NOT NULL,
    "blocking" BOOLEAN NOT NULL,
    "reconciled_at" TIMESTAMPTZ(3) NOT NULL,
    "stripe_event_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tenant_billing_risks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenant_trial_grants_user_id_key" ON "tenant_trial_grants"("user_id");

-- CreateIndex
CREATE INDEX "tenant_trial_grants_expires_at_idx" ON "tenant_trial_grants"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_trial_operations_stripe_idempotency_key_key" ON "tenant_trial_operations"("stripe_idempotency_key");

-- CreateIndex
CREATE INDEX "tenant_trial_operations_user_id_created_at_idx" ON "tenant_trial_operations"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "tenant_trial_operations_actor_user_id_created_at_idx" ON "tenant_trial_operations"("actor_user_id", "created_at");

-- CreateIndex
CREATE INDEX "tenant_trial_operations_status_lease_expires_at_idx" ON "tenant_trial_operations"("status", "lease_expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_trial_operations_user_id_id_key" ON "tenant_trial_operations"("user_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_trial_notifications_operation_id_key" ON "tenant_trial_notifications"("operation_id");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_trial_notifications_provider_idempotency_key_key" ON "tenant_trial_notifications"("provider_idempotency_key");

-- CreateIndex
CREATE INDEX "tenant_trial_notifications_user_id_created_at_idx" ON "tenant_trial_notifications"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "tenant_trial_notifications_status_lease_expires_at_idx" ON "tenant_trial_notifications"("status", "lease_expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_trial_notifications_user_id_operation_id_key" ON "tenant_trial_notifications"("user_id", "operation_id");

-- CreateIndex
CREATE INDEX "tenant_billing_risks_user_id_blocking_idx" ON "tenant_billing_risks"("user_id", "blocking");

-- CreateIndex
CREATE INDEX "tenant_billing_risks_stripe_subscription_id_idx" ON "tenant_billing_risks"("stripe_subscription_id");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_billing_risks_kind_stripe_object_id_key" ON "tenant_billing_risks"("kind", "stripe_object_id");

-- AddForeignKey
ALTER TABLE "tenant_trial_grants" ADD CONSTRAINT "tenant_trial_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_trial_grants" ADD CONSTRAINT "tenant_trial_grants_user_id_creator_operation_id_fkey" FOREIGN KEY ("user_id", "creator_operation_id") REFERENCES "tenant_trial_operations"("user_id", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tenant_trial_grants" ADD CONSTRAINT "tenant_trial_grants_user_id_last_operation_id_fkey" FOREIGN KEY ("user_id", "last_operation_id") REFERENCES "tenant_trial_operations"("user_id", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tenant_trial_operations" ADD CONSTRAINT "tenant_trial_operations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_trial_notifications" ADD CONSTRAINT "tenant_trial_notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_trial_notifications" ADD CONSTRAINT "tenant_trial_notifications_user_id_operation_id_fkey" FOREIGN KEY ("user_id", "operation_id") REFERENCES "tenant_trial_operations"("user_id", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tenant_billing_risks" ADD CONSTRAINT "tenant_billing_risks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
