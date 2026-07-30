/*
  Warnings:

  - A unique constraint covering the columns `[p2p_token]` on the table `tracked_invoices` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "tracked_invoices" ADD COLUMN     "p2p_token" TEXT;

-- CreateTable
CREATE TABLE "promise_to_pay" (
    "id" TEXT NOT NULL,
    "tracked_invoice_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "promised_pay_by" TIMESTAMP(3) NOT NULL,
    "promised_amount" INTEGER,
    "client_notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "breach_notified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promise_to_pay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "promise_to_pay_tracked_invoice_id_created_at_idx" ON "promise_to_pay"("tracked_invoice_id", "created_at");

-- CreateIndex
CREATE INDEX "promise_to_pay_status_promised_pay_by_idx" ON "promise_to_pay"("status", "promised_pay_by");

-- CreateIndex
CREATE UNIQUE INDEX "tracked_invoices_p2p_token_key" ON "tracked_invoices"("p2p_token");

-- AddForeignKey
ALTER TABLE "promise_to_pay" ADD CONSTRAINT "promise_to_pay_tracked_invoice_id_fkey" FOREIGN KEY ("tracked_invoice_id") REFERENCES "tracked_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
