-- AlterTable
ALTER TABLE "user_profiles" ADD COLUMN     "latest_stripe_event_created_at" TIMESTAMP(3),
ADD COLUMN     "stripe_price_id" TEXT,
ADD COLUMN     "subscription_cancel_at_period_end" BOOLEAN,
ALTER COLUMN "subscriptionTier" SET DEFAULT 'essentials';

-- CreateTable
CREATE TABLE "stripe_billing_webhook_events" (
    "id" TEXT NOT NULL,
    "stripe_event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "event_created_at" TIMESTAMP(3) NOT NULL,
    "processing_status" TEXT NOT NULL DEFAULT 'received',
    "processing_note" TEXT,
    "user_id" TEXT,
    "stripe_customer_id" TEXT,
    "stripe_subscription_id" TEXT,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stripe_billing_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stripe_billing_webhook_events_stripe_event_id_key" ON "stripe_billing_webhook_events"("stripe_event_id");

-- CreateIndex
CREATE INDEX "stripe_billing_webhook_events_event_type_event_created_at_idx" ON "stripe_billing_webhook_events"("event_type", "event_created_at");

-- CreateIndex
CREATE INDEX "stripe_billing_webhook_events_stripe_customer_id_idx" ON "stripe_billing_webhook_events"("stripe_customer_id");

-- CreateIndex
CREATE INDEX "stripe_billing_webhook_events_stripe_subscription_id_idx" ON "stripe_billing_webhook_events"("stripe_subscription_id");

-- CreateIndex
CREATE INDEX "stripe_billing_webhook_events_user_id_idx" ON "stripe_billing_webhook_events"("user_id");
