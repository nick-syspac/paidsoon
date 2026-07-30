-- AlterTable
ALTER TABLE "tracked_invoices" ADD COLUMN     "first_chased_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "user_profiles" ADD COLUMN     "subscription_current_period_start" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "tracked_invoices_userId_first_chased_at_idx" ON "tracked_invoices"("userId", "first_chased_at");
