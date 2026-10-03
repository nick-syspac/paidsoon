-- CreateTable
CREATE TABLE "spend_classification_claims" (
    "user_id" TEXT NOT NULL,
    "classification_id" TEXT NOT NULL,
    "claim_token" TEXT NOT NULL,
    "source_fingerprint" TEXT NOT NULL,
    "lease_expires_at" TIMESTAMP(3) NOT NULL,
    "claimed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "spend_classification_claims_pkey" PRIMARY KEY ("user_id","classification_id")
);

-- CreateTable
CREATE TABLE "spend_classification_worker_leases" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "owner_token" TEXT NOT NULL,
    "lease_expires_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spend_classification_worker_leases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "spend_classification_claims_claim_token_key" ON "spend_classification_claims"("claim_token");

-- CreateIndex
CREATE INDEX "spend_classification_claims_lease_expires_at_idx" ON "spend_classification_claims"("lease_expires_at");

-- AddForeignKey
ALTER TABLE "spend_classification_claims" ADD CONSTRAINT "spend_classification_claims_user_id_classification_id_fkey" FOREIGN KEY ("user_id", "classification_id") REFERENCES "spend_classifications"("user_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
