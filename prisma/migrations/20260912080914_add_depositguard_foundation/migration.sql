-- CreateEnum
CREATE TYPE "DepositGuardDepositType" AS ENUM ('none', 'percentage', 'fixed');

-- CreateEnum
CREATE TYPE "DepositGuardWorkStatus" AS ENUM ('draft', 'awaiting_deposit', 'ready_to_start', 'in_progress', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "DepositGuardPaymentStatus" AS ENUM ('draft', 'not_requested', 'requested', 'viewed', 'partially_paid', 'paid', 'overdue', 'cancelled', 'refunded');

-- CreateEnum
CREATE TYPE "DepositRequestType" AS ENUM ('deposit', 'progress_payment', 'final_payment');

-- CreateEnum
CREATE TYPE "DepositRequestStatus" AS ENUM ('draft', 'requested', 'viewed', 'partially_paid', 'paid', 'overdue', 'cancelled', 'expired', 'failed');

-- CreateEnum
CREATE TYPE "PaymentMilestoneAmountType" AS ENUM ('percentage', 'fixed');

-- CreateEnum
CREATE TYPE "PaymentMilestoneTriggerType" AS ENUM ('manual', 'date', 'work_status');

-- CreateEnum
CREATE TYPE "PaymentMilestoneStatus" AS ENUM ('planned', 'ready', 'requested', 'partially_paid', 'paid', 'overdue', 'cancelled');

-- CreateEnum
CREATE TYPE "DepositPaymentStatus" AS ENUM ('pending', 'confirmed', 'failed', 'refunded', 'cancelled');

-- CreateEnum
CREATE TYPE "DepositReminderType" AS ENUM ('initial_request', 'before_due', 'due_today', 'overdue_3_days', 'overdue_7_days');

-- CreateEnum
CREATE TYPE "DepositReminderDeliveryStatus" AS ENUM ('pending', 'sent', 'failed', 'skipped', 'cancelled');

-- CreateEnum
CREATE TYPE "DepositGuardEventType" AS ENUM ('job_created', 'deposit_calculated', 'request_created', 'request_sent', 'request_viewed', 'reminder_scheduled', 'reminder_sent', 'payment_recorded', 'payment_confirmed', 'payment_failed', 'job_unblocked', 'milestone_created', 'milestone_requested', 'request_cancelled', 'job_completed');

-- CreateTable
CREATE TABLE "deposit_guard_jobs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "external_quote_id" TEXT,
    "external_quote_number" TEXT,
    "accounting_provider" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "reference" TEXT,
    "currency" TEXT NOT NULL,
    "quoted_amount_cents" INTEGER,
    "tax_amount_cents" INTEGER,
    "total_amount_cents" INTEGER NOT NULL,
    "deposit_type" "DepositGuardDepositType" NOT NULL DEFAULT 'percentage',
    "deposit_percentage" DECIMAL(6,3),
    "deposit_fixed_amount_cents" INTEGER,
    "required_deposit_amount_cents" INTEGER NOT NULL,
    "amount_paid_cents" INTEGER NOT NULL DEFAULT 0,
    "outstanding_amount_cents" INTEGER NOT NULL,
    "work_status" "DepositGuardWorkStatus" NOT NULL DEFAULT 'draft',
    "payment_status" "DepositGuardPaymentStatus" NOT NULL DEFAULT 'not_requested',
    "commencement_blocked" BOOLEAN NOT NULL DEFAULT false,
    "expected_start_date" TIMESTAMP(3),
    "expected_completion_date" TIMESTAMP(3),
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "deposit_guard_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deposit_requests" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "request_type" "DepositRequestType" NOT NULL,
    "description" TEXT,
    "amount_cents" INTEGER NOT NULL,
    "tax_amount_cents" INTEGER,
    "total_amount_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "due_date" TIMESTAMP(3) NOT NULL,
    "status" "DepositRequestStatus" NOT NULL DEFAULT 'draft',
    "payment_provider" TEXT,
    "external_payment_reference" TEXT,
    "external_payment_url" TEXT,
    "public_token_hash" TEXT,
    "token_expires_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "first_viewed_at" TIMESTAMP(3),
    "last_viewed_at" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deposit_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_milestones" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sequence" INTEGER NOT NULL,
    "amount_type" "PaymentMilestoneAmountType" NOT NULL,
    "percentage" DECIMAL(6,3),
    "fixed_amount_cents" INTEGER,
    "calculated_amount_cents" INTEGER NOT NULL,
    "trigger_type" "PaymentMilestoneTriggerType" NOT NULL DEFAULT 'manual',
    "target_date" TIMESTAMP(3),
    "status" "PaymentMilestoneStatus" NOT NULL DEFAULT 'planned',
    "deposit_request_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deposit_payments" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "deposit_request_id" TEXT,
    "amount_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "payment_method" TEXT NOT NULL,
    "payment_provider" TEXT,
    "external_payment_id" TEXT,
    "status" "DepositPaymentStatus" NOT NULL DEFAULT 'pending',
    "paid_at" TIMESTAMP(3),
    "recorded_by" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deposit_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deposit_reminders" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "deposit_request_id" TEXT NOT NULL,
    "reminder_type" "DepositReminderType" NOT NULL,
    "scheduled_for" TIMESTAMP(3) NOT NULL,
    "sent_at" TIMESTAMP(3),
    "delivery_status" "DepositReminderDeliveryStatus" NOT NULL DEFAULT 'pending',
    "provider_message_id" TEXT,
    "failure_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deposit_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deposit_guard_events" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "job_id" TEXT,
    "deposit_request_id" TEXT,
    "deposit_payment_id" TEXT,
    "event_type" "DepositGuardEventType" NOT NULL,
    "actor_user_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deposit_guard_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "deposit_guard_jobs_user_id_work_status_idx" ON "deposit_guard_jobs"("user_id", "work_status");

-- CreateIndex
CREATE INDEX "deposit_guard_jobs_user_id_payment_status_idx" ON "deposit_guard_jobs"("user_id", "payment_status");

-- CreateIndex
CREATE INDEX "deposit_guard_jobs_customer_id_idx" ON "deposit_guard_jobs"("customer_id");

-- CreateIndex
CREATE INDEX "deposit_guard_jobs_external_quote_id_idx" ON "deposit_guard_jobs"("external_quote_id");

-- CreateIndex
CREATE UNIQUE INDEX "deposit_requests_public_token_hash_key" ON "deposit_requests"("public_token_hash");

-- CreateIndex
CREATE INDEX "deposit_requests_user_id_status_idx" ON "deposit_requests"("user_id", "status");

-- CreateIndex
CREATE INDEX "deposit_requests_user_id_due_date_idx" ON "deposit_requests"("user_id", "due_date");

-- CreateIndex
CREATE INDEX "deposit_requests_job_id_request_type_idx" ON "deposit_requests"("job_id", "request_type");

-- CreateIndex
CREATE INDEX "deposit_requests_customer_id_idx" ON "deposit_requests"("customer_id");

-- CreateIndex
CREATE INDEX "payment_milestones_user_id_status_idx" ON "payment_milestones"("user_id", "status");

-- CreateIndex
CREATE INDEX "payment_milestones_deposit_request_id_idx" ON "payment_milestones"("deposit_request_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_milestones_job_id_sequence_key" ON "payment_milestones"("job_id", "sequence");

-- CreateIndex
CREATE INDEX "deposit_payments_user_id_status_idx" ON "deposit_payments"("user_id", "status");

-- CreateIndex
CREATE INDEX "deposit_payments_job_id_paid_at_idx" ON "deposit_payments"("job_id", "paid_at");

-- CreateIndex
CREATE INDEX "deposit_payments_deposit_request_id_idx" ON "deposit_payments"("deposit_request_id");

-- CreateIndex
CREATE INDEX "deposit_payments_payment_provider_external_payment_id_idx" ON "deposit_payments"("payment_provider", "external_payment_id");

-- CreateIndex
CREATE INDEX "deposit_reminders_user_id_scheduled_for_idx" ON "deposit_reminders"("user_id", "scheduled_for");

-- CreateIndex
CREATE INDEX "deposit_reminders_delivery_status_idx" ON "deposit_reminders"("delivery_status");

-- CreateIndex
CREATE UNIQUE INDEX "deposit_reminders_deposit_request_id_reminder_type_schedule_key" ON "deposit_reminders"("deposit_request_id", "reminder_type", "scheduled_for");

-- CreateIndex
CREATE INDEX "deposit_guard_events_user_id_created_at_idx" ON "deposit_guard_events"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "deposit_guard_events_event_type_created_at_idx" ON "deposit_guard_events"("event_type", "created_at");

-- CreateIndex
CREATE INDEX "deposit_guard_events_job_id_idx" ON "deposit_guard_events"("job_id");

-- CreateIndex
CREATE INDEX "deposit_guard_events_deposit_request_id_idx" ON "deposit_guard_events"("deposit_request_id");

-- CreateIndex
CREATE INDEX "deposit_guard_events_deposit_payment_id_idx" ON "deposit_guard_events"("deposit_payment_id");

-- AddForeignKey
ALTER TABLE "deposit_guard_jobs" ADD CONSTRAINT "deposit_guard_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit_guard_jobs" ADD CONSTRAINT "deposit_guard_jobs_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit_requests" ADD CONSTRAINT "deposit_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit_requests" ADD CONSTRAINT "deposit_requests_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "deposit_guard_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit_requests" ADD CONSTRAINT "deposit_requests_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_milestones" ADD CONSTRAINT "payment_milestones_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_milestones" ADD CONSTRAINT "payment_milestones_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "deposit_guard_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_milestones" ADD CONSTRAINT "payment_milestones_deposit_request_id_fkey" FOREIGN KEY ("deposit_request_id") REFERENCES "deposit_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit_payments" ADD CONSTRAINT "deposit_payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit_payments" ADD CONSTRAINT "deposit_payments_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "deposit_guard_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit_payments" ADD CONSTRAINT "deposit_payments_deposit_request_id_fkey" FOREIGN KEY ("deposit_request_id") REFERENCES "deposit_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit_reminders" ADD CONSTRAINT "deposit_reminders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit_reminders" ADD CONSTRAINT "deposit_reminders_deposit_request_id_fkey" FOREIGN KEY ("deposit_request_id") REFERENCES "deposit_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit_guard_events" ADD CONSTRAINT "deposit_guard_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit_guard_events" ADD CONSTRAINT "deposit_guard_events_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "deposit_guard_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit_guard_events" ADD CONSTRAINT "deposit_guard_events_deposit_request_id_fkey" FOREIGN KEY ("deposit_request_id") REFERENCES "deposit_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit_guard_events" ADD CONSTRAINT "deposit_guard_events_deposit_payment_id_fkey" FOREIGN KEY ("deposit_payment_id") REFERENCES "deposit_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
