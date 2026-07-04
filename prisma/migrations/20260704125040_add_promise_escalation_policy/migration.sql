-- CreateTable
CREATE TABLE "promise_escalation_policies" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "retry_limit" INTEGER NOT NULL DEFAULT 2,
    "escalation_threshold" INTEGER NOT NULL DEFAULT 2,
    "timing_escalation_enabled" BOOLEAN NOT NULL DEFAULT false,
    "tone_escalation_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promise_escalation_policies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "promise_escalation_policies_user_id_key" ON "promise_escalation_policies"("user_id");

-- AddForeignKey
ALTER TABLE "promise_escalation_policies" ADD CONSTRAINT "promise_escalation_policies_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
