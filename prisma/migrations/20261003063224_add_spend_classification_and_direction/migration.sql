/*
  Warnings:

  - A unique constraint covering the columns `[user_id,id]` on the table `imported_bank_transactions` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[user_id,id]` on the table `imported_bills` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "SpendDirection" AS ENUM ('outflow', 'inflow', 'unknown');

-- AlterTable
ALTER TABLE "imported_bank_transactions" ADD COLUMN     "direction" "SpendDirection" NOT NULL DEFAULT 'unknown';

-- CreateTable
CREATE TABLE "spend_classification_settings" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spend_classification_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spend_categories" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "key" TEXT,
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'active',
    "merged_into_category_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spend_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spend_tags" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spend_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spend_classifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "imported_bill_id" TEXT,
    "imported_bank_transaction_id" TEXT,
    "category_id" TEXT,
    "source_type" TEXT NOT NULL,
    "source_record_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "origin" TEXT,
    "confidence" DOUBLE PRECISION,
    "probabilities" JSONB,
    "model" TEXT,
    "rule_id" TEXT,
    "source_fingerprint" TEXT,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3),
    "last_error_code" TEXT,
    "claimed_at" TIMESTAMP(3),
    "created_by" TEXT,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spend_classifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spend_classification_rules" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rule_type" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "match_config" JSONB NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spend_classification_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spend_classification_events" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "classification_id" TEXT,
    "event_type" TEXT NOT NULL,
    "actor_id" TEXT,
    "old_category_id" TEXT,
    "new_category_id" TEXT,
    "reason" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "spend_classification_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spend_classification_tags" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "classification_id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "spend_classification_tags_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "spend_classification_settings_user_id_key" ON "spend_classification_settings"("user_id");

-- CreateIndex
CREATE INDEX "spend_categories_user_id_status_idx" ON "spend_categories"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "spend_categories_user_id_id_key" ON "spend_categories"("user_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "spend_categories_user_id_normalized_name_key" ON "spend_categories"("user_id", "normalized_name");

-- CreateIndex
CREATE UNIQUE INDEX "spend_categories_user_id_key_key" ON "spend_categories"("user_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "spend_tags_user_id_id_key" ON "spend_tags"("user_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "spend_tags_user_id_normalized_name_key" ON "spend_tags"("user_id", "normalized_name");

-- CreateIndex
CREATE INDEX "spend_classifications_user_id_status_next_attempt_at_idx" ON "spend_classifications"("user_id", "status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "spend_classifications_status_next_attempt_at_idx" ON "spend_classifications"("status", "next_attempt_at");

-- CreateIndex
CREATE UNIQUE INDEX "spend_classifications_user_id_id_key" ON "spend_classifications"("user_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "spend_classifications_user_id_imported_bill_id_key" ON "spend_classifications"("user_id", "imported_bill_id");

-- CreateIndex
CREATE UNIQUE INDEX "spend_classifications_user_id_imported_bank_transaction_id_key" ON "spend_classifications"("user_id", "imported_bank_transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "spend_classifications_user_id_source_type_source_record_id_key" ON "spend_classifications"("user_id", "source_type", "source_record_id");

-- CreateIndex
CREATE INDEX "spend_classification_rules_user_id_enabled_priority_idx" ON "spend_classification_rules"("user_id", "enabled", "priority");

-- CreateIndex
CREATE INDEX "spend_classification_rules_user_id_rule_type_idx" ON "spend_classification_rules"("user_id", "rule_type");

-- CreateIndex
CREATE UNIQUE INDEX "spend_classification_rules_user_id_id_key" ON "spend_classification_rules"("user_id", "id");

-- CreateIndex
CREATE INDEX "spend_classification_events_user_id_created_at_idx" ON "spend_classification_events"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "spend_classification_events_user_id_classification_id_idx" ON "spend_classification_events"("user_id", "classification_id");

-- CreateIndex
CREATE UNIQUE INDEX "spend_classification_tags_user_id_classification_id_tag_id_key" ON "spend_classification_tags"("user_id", "classification_id", "tag_id");

-- CreateIndex
CREATE UNIQUE INDEX "imported_bank_transactions_user_id_id_key" ON "imported_bank_transactions"("user_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "imported_bills_user_id_id_key" ON "imported_bills"("user_id", "id");

-- AddForeignKey
ALTER TABLE "spend_classification_settings" ADD CONSTRAINT "spend_classification_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spend_categories" ADD CONSTRAINT "spend_categories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spend_categories" ADD CONSTRAINT "spend_categories_user_id_merged_into_category_id_fkey" FOREIGN KEY ("user_id", "merged_into_category_id") REFERENCES "spend_categories"("user_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spend_tags" ADD CONSTRAINT "spend_tags_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spend_classifications" ADD CONSTRAINT "spend_classifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spend_classifications" ADD CONSTRAINT "spend_classifications_user_id_category_id_fkey" FOREIGN KEY ("user_id", "category_id") REFERENCES "spend_categories"("user_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spend_classifications" ADD CONSTRAINT "spend_classifications_user_id_imported_bill_id_fkey" FOREIGN KEY ("user_id", "imported_bill_id") REFERENCES "imported_bills"("user_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spend_classifications" ADD CONSTRAINT "spend_classifications_user_id_imported_bank_transaction_id_fkey" FOREIGN KEY ("user_id", "imported_bank_transaction_id") REFERENCES "imported_bank_transactions"("user_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spend_classifications" ADD CONSTRAINT "spend_classifications_user_id_rule_id_fkey" FOREIGN KEY ("user_id", "rule_id") REFERENCES "spend_classification_rules"("user_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spend_classification_rules" ADD CONSTRAINT "spend_classification_rules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spend_classification_rules" ADD CONSTRAINT "spend_classification_rules_user_id_category_id_fkey" FOREIGN KEY ("user_id", "category_id") REFERENCES "spend_categories"("user_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spend_classification_events" ADD CONSTRAINT "spend_classification_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spend_classification_events" ADD CONSTRAINT "spend_classification_events_user_id_classification_id_fkey" FOREIGN KEY ("user_id", "classification_id") REFERENCES "spend_classifications"("user_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spend_classification_tags" ADD CONSTRAINT "spend_classification_tags_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spend_classification_tags" ADD CONSTRAINT "spend_classification_tags_user_id_classification_id_fkey" FOREIGN KEY ("user_id", "classification_id") REFERENCES "spend_classifications"("user_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spend_classification_tags" ADD CONSTRAINT "spend_classification_tags_user_id_tag_id_fkey" FOREIGN KEY ("user_id", "tag_id") REFERENCES "spend_tags"("user_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
