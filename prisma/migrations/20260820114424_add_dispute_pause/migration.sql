-- AlterTable
ALTER TABLE "tracked_invoices" ADD COLUMN     "dispute_note" TEXT,
ADD COLUMN     "dispute_raised_at" TIMESTAMP(3),
ADD COLUMN     "dispute_resolved_at" TIMESTAMP(3);
