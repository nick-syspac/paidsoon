-- CreateTable
CREATE TABLE "spend_leak_settings" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "enabled_source_types" TEXT[] DEFAULT ARRAY['bills', 'bank_transactions', 'suppliers']::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spend_leak_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "spend_leak_settings_user_id_key" ON "spend_leak_settings"("user_id");

-- AddForeignKey
ALTER TABLE "spend_leak_settings" ADD CONSTRAINT "spend_leak_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
