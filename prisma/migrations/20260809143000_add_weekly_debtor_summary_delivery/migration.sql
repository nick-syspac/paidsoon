-- CreateTable
CREATE TABLE "weekly_debtor_summary_deliveries" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "week_start" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'sending',
    "resend_message_id" TEXT,
    "last_error" TEXT,
    "subject" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weekly_debtor_summary_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "weekly_debtor_summary_deliveries_user_id_week_start_key" ON "weekly_debtor_summary_deliveries"("user_id", "week_start");

-- CreateIndex
CREATE INDEX "weekly_debtor_summary_deliveries_status_week_start_idx" ON "weekly_debtor_summary_deliveries"("status", "week_start");
