-- AlterTable
ALTER TABLE "spend_classifications" ADD COLUMN     "refund_for_classification_id" TEXT;

-- CreateIndex
CREATE INDEX "spend_classifications_user_id_refund_for_classification_id_idx" ON "spend_classifications"("user_id", "refund_for_classification_id");

-- AddForeignKey
ALTER TABLE "spend_classifications" ADD CONSTRAINT "spend_classifications_user_id_refund_for_classification_id_fkey" FOREIGN KEY ("user_id", "refund_for_classification_id") REFERENCES "spend_classifications"("user_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
