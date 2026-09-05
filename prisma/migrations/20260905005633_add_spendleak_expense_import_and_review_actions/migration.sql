-- AlterTable
ALTER TABLE "spend_insights" ADD COLUMN     "evidence_fingerprint" TEXT,
ADD COLUMN     "review_action" TEXT,
ADD COLUMN     "review_action_at" TIMESTAMP(3),
ADD COLUMN     "review_action_by" TEXT,
ADD COLUMN     "review_note" TEXT;

-- CreateTable
CREATE TABLE "spend_import_batches" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_type" TEXT NOT NULL,
    "file_size_bytes" INTEGER NOT NULL,
    "content_hash" TEXT NOT NULL,
    "schema_version" TEXT NOT NULL,
    "worksheet_name" TEXT,
    "default_currency" TEXT,
    "duplicate_mode" TEXT NOT NULL DEFAULT 'update_existing',
    "mapping" JSONB,
    "status" TEXT NOT NULL DEFAULT 'uploaded',
    "failure_reason" TEXT,
    "rows_total" INTEGER NOT NULL DEFAULT 0,
    "rows_valid" INTEGER NOT NULL DEFAULT 0,
    "rows_warning" INTEGER NOT NULL DEFAULT 0,
    "rows_skipped" INTEGER NOT NULL DEFAULT 0,
    "rows_failed" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validated_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spend_import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spend_import_column_mappings" (
    "id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "source_column" TEXT NOT NULL,
    "target_field" TEXT NOT NULL,
    "suggested" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "spend_import_column_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spend_import_staging_rows" (
    "id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "row_number" INTEGER NOT NULL,
    "raw" JSONB NOT NULL,
    "normalized" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "validation_errors" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spend_import_staging_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spend_import_errors" (
    "id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "row_number" INTEGER,
    "field_name" TEXT,
    "error_code" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'error',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "spend_import_errors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "spend_import_batches_user_id_status_idx" ON "spend_import_batches"("user_id", "status");

-- CreateIndex
CREATE INDEX "spend_import_batches_user_id_created_at_idx" ON "spend_import_batches"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "spend_import_batches_status_updated_at_idx" ON "spend_import_batches"("status", "updated_at");

-- CreateIndex
CREATE INDEX "spend_import_column_mappings_batch_id_target_field_idx" ON "spend_import_column_mappings"("batch_id", "target_field");

-- CreateIndex
CREATE UNIQUE INDEX "spend_import_column_mappings_batch_id_source_column_key" ON "spend_import_column_mappings"("batch_id", "source_column");

-- CreateIndex
CREATE INDEX "spend_import_staging_rows_batch_id_status_idx" ON "spend_import_staging_rows"("batch_id", "status");

-- CreateIndex
CREATE INDEX "spend_import_staging_rows_batch_id_row_number_idx" ON "spend_import_staging_rows"("batch_id", "row_number");

-- CreateIndex
CREATE INDEX "spend_import_errors_batch_id_severity_idx" ON "spend_import_errors"("batch_id", "severity");

-- CreateIndex
CREATE INDEX "spend_import_errors_batch_id_error_code_idx" ON "spend_import_errors"("batch_id", "error_code");

-- AddForeignKey
ALTER TABLE "spend_import_batches" ADD CONSTRAINT "spend_import_batches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spend_import_column_mappings" ADD CONSTRAINT "spend_import_column_mappings_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "spend_import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spend_import_staging_rows" ADD CONSTRAINT "spend_import_staging_rows_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "spend_import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spend_import_errors" ADD CONSTRAINT "spend_import_errors_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "spend_import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
