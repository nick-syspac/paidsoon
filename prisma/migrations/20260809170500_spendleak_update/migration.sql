-- DropForeignKey
ALTER TABLE "cash_forecast_snapshots" DROP CONSTRAINT "cash_forecast_snapshots_accounting_connection_id_fkey";

-- DropForeignKey
ALTER TABLE "spend_insights" DROP CONSTRAINT "spend_insights_accounting_connection_id_fkey";

-- DropForeignKey
ALTER TABLE "training_revisions" DROP CONSTRAINT "training_revisions_restored_from_revision_id_fkey";

-- CreateIndex
CREATE INDEX "spend_insights_user_id_state_severity_idx" ON "spend_insights"("user_id", "state", "severity");

-- CreateIndex
CREATE INDEX "spend_insights_user_id_detected_at_idx" ON "spend_insights"("user_id", "detected_at");

-- AddForeignKey
ALTER TABLE "spend_insights" ADD CONSTRAINT "spend_insights_accounting_connection_id_fkey" FOREIGN KEY ("accounting_connection_id") REFERENCES "accounting_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_forecast_snapshots" ADD CONSTRAINT "cash_forecast_snapshots_accounting_connection_id_fkey" FOREIGN KEY ("accounting_connection_id") REFERENCES "accounting_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_revisions" ADD CONSTRAINT "training_revisions_restored_from_revision_id_fkey" FOREIGN KEY ("restored_from_revision_id") REFERENCES "training_revisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "imported_bank_transactions_accounting_connection_id_provider_tr" RENAME TO "imported_bank_transactions_accounting_connection_id_provide_key";

-- RenameIndex
ALTER INDEX "supplier_profiles_accounting_connection_id_provider_supplier_id" RENAME TO "supplier_profiles_accounting_connection_id_provider_supplie_key";

-- RenameIndex
ALTER INDEX "training_destination_usages_training_content_id_destination__ke" RENAME TO "training_destination_usages_training_content_id_destination_key";
