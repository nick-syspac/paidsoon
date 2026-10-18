-- CreateEnum
CREATE TYPE "TenantBillingMutationAction" AS ENUM ('customer_create', 'checkout_create', 'upgrade', 'cancel', 'cancel_portal_create', 'schedule_downgrade', 'undo_downgrade', 'portal_create');

-- CreateEnum
CREATE TYPE "TenantBillingMutationStatus" AS ENUM ('pending', 'reconciliation_required', 'succeeded', 'failed', 'superseded');

-- CreateEnum
CREATE TYPE "TenantBillingMutationStepStatus" AS ENUM ('pending', 'reconciliation_required', 'succeeded', 'failed');

-- AlterTable
ALTER TABLE "user_profiles" ADD COLUMN     "pending_billing_mutation_id" UUID;

-- CreateTable
CREATE TABLE "tenant_billing_mutations" (
    "id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "action" "TenantBillingMutationAction" NOT NULL,
    "input_hash" TEXT NOT NULL,
    "normalized_input" JSONB NOT NULL,
    "starting_version" INTEGER NOT NULL,
    "starting_binding" JSONB NOT NULL,
    "starting_fingerprint" TEXT NOT NULL,
    "execution_version" INTEGER,
    "parent_mutation_id" UUID,
    "status" "TenantBillingMutationStatus" NOT NULL DEFAULT 'pending',
    "stripe_customer_id" TEXT,
    "stripe_subscription_id" TEXT,
    "stripe_session_id" TEXT,
    "stripe_schedule_id" TEXT,
    "stripe_request_id" TEXT,
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

    CONSTRAINT "tenant_billing_mutations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_billing_mutation_steps" (
    "id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "mutation_id" UUID NOT NULL,
    "step_key" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "normalized_request" JSONB NOT NULL,
    "request_hash" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "object_target" TEXT NOT NULL,
    "stripe_idempotency_key" TEXT NOT NULL,
    "status" "TenantBillingMutationStepStatus" NOT NULL DEFAULT 'pending',
    "stripe_customer_id" TEXT,
    "stripe_subscription_id" TEXT,
    "stripe_session_id" TEXT,
    "stripe_schedule_id" TEXT,
    "stripe_request_id" TEXT,
    "provider_result" JSONB,
    "failure_code" TEXT,
    "failure_summary" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "first_attempt_at" TIMESTAMPTZ(3),
    "last_attempt_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tenant_billing_mutation_steps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tenant_billing_mutations_user_id_created_at_idx" ON "tenant_billing_mutations"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "tenant_billing_mutations_user_id_parent_mutation_id_idx" ON "tenant_billing_mutations"("user_id", "parent_mutation_id");

-- CreateIndex
CREATE INDEX "tenant_billing_mutations_status_lease_expires_at_idx" ON "tenant_billing_mutations"("status", "lease_expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_billing_mutations_user_id_id_key" ON "tenant_billing_mutations"("user_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_billing_mutation_steps_stripe_idempotency_key_key" ON "tenant_billing_mutation_steps"("stripe_idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_billing_mutation_steps_user_id_mutation_id_step_key_key" ON "tenant_billing_mutation_steps"("user_id", "mutation_id", "step_key");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_billing_mutation_steps_user_id_mutation_id_sequence_key" ON "tenant_billing_mutation_steps"("user_id", "mutation_id", "sequence");

-- AddForeignKey
ALTER TABLE "tenant_billing_mutations" ADD CONSTRAINT "tenant_billing_mutations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_billing_mutations" ADD CONSTRAINT "tenant_billing_mutations_user_id_parent_mutation_id_fkey" FOREIGN KEY ("user_id", "parent_mutation_id") REFERENCES "tenant_billing_mutations"("user_id", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tenant_billing_mutation_steps" ADD CONSTRAINT "tenant_billing_mutation_steps_user_id_mutation_id_fkey" FOREIGN KEY ("user_id", "mutation_id") REFERENCES "tenant_billing_mutations"("user_id", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;
