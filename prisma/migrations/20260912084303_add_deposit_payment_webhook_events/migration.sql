-- CreateTable
CREATE TABLE "deposit_payment_webhook_events" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "processing_status" TEXT NOT NULL DEFAULT 'received',
    "processing_note" TEXT,
    "payload_hash" TEXT,
    "user_id" TEXT,
    "job_id" TEXT,
    "deposit_request_id" TEXT,
    "external_payment_reference" TEXT,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deposit_payment_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "deposit_payment_webhook_events_processing_status_created_at_idx" ON "deposit_payment_webhook_events"("processing_status", "created_at");

-- CreateIndex
CREATE INDEX "deposit_payment_webhook_events_user_id_created_at_idx" ON "deposit_payment_webhook_events"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "deposit_payment_webhook_events_job_id_idx" ON "deposit_payment_webhook_events"("job_id");

-- CreateIndex
CREATE INDEX "deposit_payment_webhook_events_deposit_request_id_idx" ON "deposit_payment_webhook_events"("deposit_request_id");

-- CreateIndex
CREATE UNIQUE INDEX "deposit_payment_webhook_events_provider_provider_event_id_key" ON "deposit_payment_webhook_events"("provider", "provider_event_id");

-- AddForeignKey
ALTER TABLE "deposit_payment_webhook_events" ADD CONSTRAINT "deposit_payment_webhook_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("userId") ON DELETE SET NULL ON UPDATE CASCADE;
