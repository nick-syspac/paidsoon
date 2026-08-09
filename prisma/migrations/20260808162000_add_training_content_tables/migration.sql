-- CreateEnum
CREATE TYPE "TrainingLifecycleState" AS ENUM ('draft', 'review', 'published');

-- CreateEnum
CREATE TYPE "TrainingAudience" AS ENUM ('public', 'signed_in');

-- CreateEnum
CREATE TYPE "TrainingDestinationValidationStatus" AS ENUM ('pending', 'valid', 'invalid', 'deprecated');

-- CreateTable
CREATE TABLE "training_content" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "content" JSONB NOT NULL,
    "lifecycle_state" "TrainingLifecycleState" NOT NULL DEFAULT 'draft',
    "audience" "TrainingAudience" NOT NULL DEFAULT 'signed_in',
    "feature_key" TEXT,
    "route_hint" TEXT,
    "destination_keys" JSONB,
    "published_at" TIMESTAMP(3),
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_content_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_revisions" (
    "id" TEXT NOT NULL,
    "training_content_id" TEXT NOT NULL,
    "revision_number" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "snapshot_state" "TrainingLifecycleState" NOT NULL,
    "change_note" TEXT,
    "actor_user_id" TEXT NOT NULL,
    "restored_from_revision_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "training_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_destination_usages" (
    "id" TEXT NOT NULL,
    "training_content_id" TEXT NOT NULL,
    "destination_key" TEXT NOT NULL,
    "validation_status" "TrainingDestinationValidationStatus" NOT NULL DEFAULT 'pending',
    "last_validated_at" TIMESTAMP(3),
    "validation_details" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_destination_usages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "training_content_slug_key" ON "training_content"("slug");

-- CreateIndex
CREATE INDEX "training_content_lifecycle_state_audience_published_at_idx" ON "training_content"("lifecycle_state", "audience", "published_at");

-- CreateIndex
CREATE UNIQUE INDEX "training_revisions_training_content_id_revision_number_key" ON "training_revisions"("training_content_id", "revision_number");

-- CreateIndex
CREATE INDEX "training_revisions_training_content_id_created_at_idx" ON "training_revisions"("training_content_id", "created_at");

-- CreateIndex
CREATE INDEX "training_revisions_actor_user_id_created_at_idx" ON "training_revisions"("actor_user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "training_destination_usages_training_content_id_destination__key" ON "training_destination_usages"("training_content_id", "destination_key");

-- CreateIndex
CREATE INDEX "training_destination_usages_destination_key_validation_stat_idx" ON "training_destination_usages"("destination_key", "validation_status");

-- AddForeignKey
ALTER TABLE "training_revisions" ADD CONSTRAINT "training_revisions_training_content_id_fkey" FOREIGN KEY ("training_content_id") REFERENCES "training_content"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_revisions" ADD CONSTRAINT "training_revisions_restored_from_revision_id_fkey" FOREIGN KEY ("restored_from_revision_id") REFERENCES "training_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_destination_usages" ADD CONSTRAINT "training_destination_usages_training_content_id_fkey" FOREIGN KEY ("training_content_id") REFERENCES "training_content"("id") ON DELETE CASCADE ON UPDATE CASCADE;