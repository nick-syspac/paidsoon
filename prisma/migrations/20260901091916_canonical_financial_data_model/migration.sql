/*
  Warnings:

  - You are about to drop the column `amountDue` on the `tracked_invoices` table. All the data in the column will be lost.
  - You are about to drop the column `clientEmail` on the `tracked_invoices` table. All the data in the column will be lost.
  - You are about to drop the column `clientName` on the `tracked_invoices` table. All the data in the column will be lost.
  - You are about to drop the column `dueDate` on the `tracked_invoices` table. All the data in the column will be lost.
  - You are about to drop the column `externalId` on the `tracked_invoices` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "tracked_invoices_id_userId_clientEmail_key";

-- AlterTable
ALTER TABLE "tracked_invoices" DROP COLUMN "amountDue",
DROP COLUMN "clientEmail",
DROP COLUMN "clientName",
DROP COLUMN "dueDate",
DROP COLUMN "externalId";

-- AddForeignKey
ALTER TABLE "arrangement_invoice_coverages" ADD CONSTRAINT "arrangement_invoice_coverages_tracked_invoice_id_fkey" FOREIGN KEY ("tracked_invoice_id") REFERENCES "tracked_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "imported_bank_transactions_accounting_connection_id_provide_key" RENAME TO "imported_bank_transactions_accounting_connection_id_source__key";

-- RenameIndex
ALTER INDEX "imported_bills_accounting_connection_id_provider_bill_id_key" RENAME TO "imported_bills_accounting_connection_id_source_id_key";

-- RenameIndex
ALTER INDEX "supplier_profiles_accounting_connection_id_provider_supplie_key" RENAME TO "supplier_profiles_accounting_connection_id_source_id_key";
