-- AlterTable
ALTER TABLE "arrangements" ADD COLUMN     "customer_id" TEXT;

-- AlterTable
ALTER TABLE "tracked_invoices" ADD COLUMN     "customerId" TEXT;

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "primary_email" TEXT NOT NULL,
    "primary_email_lower" TEXT NOT NULL,
    "display_name" TEXT,
    "never_auto_chase" BOOLEAN NOT NULL DEFAULT false,
    "unsubscribed" BOOLEAN NOT NULL DEFAULT false,
    "cadence_override" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customers_userId_primary_email_lower_key" ON "customers"("userId", "primary_email_lower");

-- CreateIndex
CREATE INDEX "arrangements_customer_id_idx" ON "arrangements"("customer_id");

-- CreateIndex
CREATE INDEX "tracked_invoices_customerId_idx" ON "tracked_invoices"("customerId");

-- AddForeignKey
ALTER TABLE "tracked_invoices" ADD CONSTRAINT "tracked_invoices_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arrangements" ADD CONSTRAINT "arrangements_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
