-- CreateTable
CREATE TABLE "invoice_payments" (
    "id" TEXT NOT NULL,
    "tracked_invoice_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "note" TEXT,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "invoice_payments_tracked_invoice_id_idx" ON "invoice_payments"("tracked_invoice_id");

-- CreateIndex
CREATE INDEX "invoice_payments_user_id_idx" ON "invoice_payments"("user_id");

-- AddForeignKey
ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_tracked_invoice_id_fkey" FOREIGN KEY ("tracked_invoice_id") REFERENCES "tracked_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
