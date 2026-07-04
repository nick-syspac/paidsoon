/*
  Warnings:

  - A unique constraint covering the columns `[id,userId,clientEmail]` on the table `tracked_invoices` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateTable
CREATE TABLE "arrangements" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "debtor_email" TEXT NOT NULL,
    "debtor_name" TEXT,
    "arrangement_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "promised_pay_by" TIMESTAMP(3),
    "agreed_amount" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "plan_schedule" JSONB,
    "terms_notes" TEXT,
    "expires_at" TIMESTAMP(3),
    "breached_at" TIMESTAMP(3),
    "fulfilled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "arrangements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "arrangement_invoice_coverages" (
    "id" TEXT NOT NULL,
    "arrangement_id" TEXT NOT NULL,
    "tracked_invoice_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "debtor_email" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "arrangement_invoice_coverages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "arrangements_user_id_status_idx" ON "arrangements"("user_id", "status");

-- CreateIndex
CREATE INDEX "arrangements_user_id_debtor_email_idx" ON "arrangements"("user_id", "debtor_email");

-- CreateIndex
CREATE UNIQUE INDEX "arrangements_id_user_id_debtor_email_key" ON "arrangements"("id", "user_id", "debtor_email");

-- CreateIndex
CREATE INDEX "arrangement_invoice_coverages_tracked_invoice_id_idx" ON "arrangement_invoice_coverages"("tracked_invoice_id");

-- CreateIndex
CREATE INDEX "arrangement_invoice_coverages_user_id_debtor_email_idx" ON "arrangement_invoice_coverages"("user_id", "debtor_email");

-- CreateIndex
CREATE UNIQUE INDEX "arrangement_invoice_coverages_arrangement_id_tracked_invoic_key" ON "arrangement_invoice_coverages"("arrangement_id", "tracked_invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "tracked_invoices_id_userId_clientEmail_key" ON "tracked_invoices"("id", "userId", "clientEmail");

-- AddForeignKey
ALTER TABLE "arrangements" ADD CONSTRAINT "arrangements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arrangement_invoice_coverages" ADD CONSTRAINT "arrangement_invoice_coverages_arrangement_id_user_id_debto_fkey" FOREIGN KEY ("arrangement_id", "user_id", "debtor_email") REFERENCES "arrangements"("id", "user_id", "debtor_email") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arrangement_invoice_coverages" ADD CONSTRAINT "arrangement_invoice_coverages_tracked_invoice_id_user_id_d_fkey" FOREIGN KEY ("tracked_invoice_id", "user_id", "debtor_email") REFERENCES "tracked_invoices"("id", "userId", "clientEmail") ON DELETE RESTRICT ON UPDATE CASCADE;
