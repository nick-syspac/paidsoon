/*
  Warnings:

  - A unique constraint covering the columns `[trackedInvoiceId,stage]` on the table `email_logs` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "email_logs_trackedInvoiceId_stage_key" ON "email_logs"("trackedInvoiceId", "stage");
