-- CreateTable
CREATE TABLE "invoice_import_batches" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_type" TEXT NOT NULL,
    "file_size_bytes" INTEGER NOT NULL,
    "content_hash" TEXT NOT NULL,
    "schema_version" TEXT NOT NULL,
    "worksheet_name" TEXT,
    "date_format" TEXT,
    "number_format" TEXT,
    "default_currency" TEXT,
    "duplicate_mode" TEXT NOT NULL DEFAULT 'skip_existing',
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

    CONSTRAINT "invoice_import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_import_column_mappings" (
    "id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "source_column" TEXT NOT NULL,
    "target_field" TEXT NOT NULL,
    "suggested" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_import_column_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_import_staging_rows" (
    "id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "row_number" INTEGER NOT NULL,
    "raw" JSONB NOT NULL,
    "normalized" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "validation_errors" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoice_import_staging_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_import_errors" (
    "id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "row_number" INTEGER,
    "invoice_number" TEXT,
    "field_name" TEXT,
    "error_code" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'error',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_import_errors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_import_mapping_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "schema_version" TEXT NOT NULL,
    "mapping" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoice_import_mapping_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "invoice_import_batches_user_id_status_idx" ON "invoice_import_batches"("user_id", "status");

-- CreateIndex
CREATE INDEX "invoice_import_batches_user_id_created_at_idx" ON "invoice_import_batches"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "invoice_import_batches_status_updated_at_idx" ON "invoice_import_batches"("status", "updated_at");

-- CreateIndex
CREATE INDEX "invoice_import_column_mappings_batch_id_target_field_idx" ON "invoice_import_column_mappings"("batch_id", "target_field");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_import_column_mappings_batch_id_source_column_key" ON "invoice_import_column_mappings"("batch_id", "source_column");

-- CreateIndex
CREATE INDEX "invoice_import_staging_rows_batch_id_status_idx" ON "invoice_import_staging_rows"("batch_id", "status");

-- CreateIndex
CREATE INDEX "invoice_import_staging_rows_batch_id_row_number_idx" ON "invoice_import_staging_rows"("batch_id", "row_number");

-- CreateIndex
CREATE INDEX "invoice_import_errors_batch_id_severity_idx" ON "invoice_import_errors"("batch_id", "severity");

-- CreateIndex
CREATE INDEX "invoice_import_errors_batch_id_error_code_idx" ON "invoice_import_errors"("batch_id", "error_code");

-- CreateIndex
CREATE INDEX "invoice_import_mapping_profiles_user_id_updated_at_idx" ON "invoice_import_mapping_profiles"("user_id", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_import_mapping_profiles_user_id_name_key" ON "invoice_import_mapping_profiles"("user_id", "name");

-- AddForeignKey
ALTER TABLE "invoice_import_batches" ADD CONSTRAINT "invoice_import_batches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_import_column_mappings" ADD CONSTRAINT "invoice_import_column_mappings_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "invoice_import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_import_staging_rows" ADD CONSTRAINT "invoice_import_staging_rows_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "invoice_import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_import_errors" ADD CONSTRAINT "invoice_import_errors_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "invoice_import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_import_mapping_profiles" ADD CONSTRAINT "invoice_import_mapping_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
