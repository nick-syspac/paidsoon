-- AlterEnum
ALTER TYPE "DepositGuardEventType" ADD VALUE 'settings_updated';

-- CreateTable
CREATE TABLE "deposit_guard_settings" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "auto_reminder_enabled" BOOLEAN NOT NULL DEFAULT true,
    "initial_reminder_offset_days" INTEGER NOT NULL DEFAULT 0,
    "before_due_offset_days" INTEGER NOT NULL DEFAULT 1,
    "overdue_3_enabled" BOOLEAN NOT NULL DEFAULT true,
    "overdue_7_enabled" BOOLEAN NOT NULL DEFAULT true,
    "payment_provider_default" TEXT NOT NULL DEFAULT 'manual_external_link',
    "require_deposit_before_start" BOOLEAN NOT NULL DEFAULT true,
    "settings_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deposit_guard_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "deposit_guard_settings_updated_at_idx" ON "deposit_guard_settings"("updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "deposit_guard_settings_user_id_key" ON "deposit_guard_settings"("user_id");

-- AddForeignKey
ALTER TABLE "deposit_guard_settings" ADD CONSTRAINT "deposit_guard_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
