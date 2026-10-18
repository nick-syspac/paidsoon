-- AlterTable
ALTER TABLE "stripe_billing_webhook_events" ADD COLUMN     "processing_lease_until" TIMESTAMP(3),
ADD COLUMN     "processing_token" TEXT;
