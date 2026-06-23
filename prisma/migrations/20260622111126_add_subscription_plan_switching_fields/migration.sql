-- AlterTable
ALTER TABLE "user_profiles" ADD COLUMN     "pending_downgrade_tier" TEXT,
ADD COLUMN     "stripe_schedule_id" TEXT,
ADD COLUMN     "stripe_subscription_id" TEXT,
ADD COLUMN     "subscription_current_period_end" TIMESTAMP(3);
