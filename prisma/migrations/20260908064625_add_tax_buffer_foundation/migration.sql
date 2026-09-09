-- CreateTable
CREATE TABLE "tax_buffer_configurations" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "accounting_basis" TEXT NOT NULL DEFAULT 'cash',
    "business_type" TEXT NOT NULL DEFAULT 'other',
    "gst_registered" BOOLEAN NOT NULL DEFAULT false,
    "gst_frequency" TEXT NOT NULL DEFAULT 'quarterly',
    "reserve_health_watch_threshold" DOUBLE PRECISION NOT NULL DEFAULT 0.9,
    "reserve_health_critical_threshold" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "reserve_balance_source" TEXT NOT NULL DEFAULT 'manual',
    "reserve_balance_cents" INTEGER NOT NULL DEFAULT 0,
    "reserve_account_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_buffer_configurations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_reserve_categories" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "category_type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "calculation_method" TEXT NOT NULL DEFAULT 'manual',
    "recurrence" TEXT NOT NULL DEFAULT 'quarterly',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "rate_percent" DOUBLE PRECISION,
    "fixed_amount_cents" INTEGER,
    "manual_amount_cents" INTEGER,
    "next_due_date" TIMESTAMP(3),
    "source_preference" TEXT NOT NULL DEFAULT 'auto',
    "confidence_override" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_reserve_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_buffer_obligations" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "reserve_category_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "period_start" TIMESTAMP(3),
    "period_end" TIMESTAMP(3),
    "due_date" TIMESTAMP(3) NOT NULL,
    "estimated_amount_cents" INTEGER NOT NULL,
    "reserved_amount_cents" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL,
    "source_detail" TEXT,
    "confidence" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'open',
    "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "financial_invoice_id" TEXT,
    "imported_bill_id" TEXT,
    "imported_bank_transaction_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_buffer_obligations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_buffer_snapshots" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "snapshot_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "available_cash_cents" INTEGER,
    "total_required_cents" INTEGER NOT NULL DEFAULT 0,
    "total_reserved_cents" INTEGER NOT NULL DEFAULT 0,
    "reserve_gap_cents" INTEGER NOT NULL DEFAULT 0,
    "committed_outflows_cents" INTEGER NOT NULL DEFAULT 0,
    "safe_to_spend_cents" INTEGER,
    "health_status" TEXT NOT NULL DEFAULT 'unknown',
    "warnings" JSONB,
    "calculation_inputs" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tax_buffer_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_buffer_overrides" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "reserve_category_id" TEXT,
    "obligation_id" TEXT,
    "calculated_value_cents" INTEGER NOT NULL,
    "override_value_cents" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "based_on_accountant" BOOLEAN NOT NULL DEFAULT false,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_buffer_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_buffer_events" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'info',
    "dedupe_key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tax_buffer_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tax_buffer_configurations_user_id_key" ON "tax_buffer_configurations"("user_id");

-- CreateIndex
CREATE INDEX "tax_reserve_categories_user_id_category_type_idx" ON "tax_reserve_categories"("user_id", "category_type");

-- CreateIndex
CREATE INDEX "tax_reserve_categories_user_id_enabled_idx" ON "tax_reserve_categories"("user_id", "enabled");

-- CreateIndex
CREATE INDEX "tax_buffer_obligations_user_id_due_date_idx" ON "tax_buffer_obligations"("user_id", "due_date");

-- CreateIndex
CREATE INDEX "tax_buffer_obligations_user_id_status_idx" ON "tax_buffer_obligations"("user_id", "status");

-- CreateIndex
CREATE INDEX "tax_buffer_obligations_reserve_category_id_idx" ON "tax_buffer_obligations"("reserve_category_id");

-- CreateIndex
CREATE INDEX "tax_buffer_snapshots_user_id_snapshot_at_idx" ON "tax_buffer_snapshots"("user_id", "snapshot_at");

-- CreateIndex
CREATE INDEX "tax_buffer_overrides_user_id_created_at_idx" ON "tax_buffer_overrides"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "tax_buffer_overrides_reserve_category_id_idx" ON "tax_buffer_overrides"("reserve_category_id");

-- CreateIndex
CREATE INDEX "tax_buffer_overrides_obligation_id_idx" ON "tax_buffer_overrides"("obligation_id");

-- CreateIndex
CREATE INDEX "tax_buffer_events_user_id_occurred_at_idx" ON "tax_buffer_events"("user_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "tax_buffer_events_user_id_dedupe_key_key" ON "tax_buffer_events"("user_id", "dedupe_key");

-- AddForeignKey
ALTER TABLE "tax_buffer_configurations" ADD CONSTRAINT "tax_buffer_configurations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_reserve_categories" ADD CONSTRAINT "tax_reserve_categories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_buffer_obligations" ADD CONSTRAINT "tax_buffer_obligations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_buffer_obligations" ADD CONSTRAINT "tax_buffer_obligations_reserve_category_id_fkey" FOREIGN KEY ("reserve_category_id") REFERENCES "tax_reserve_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_buffer_obligations" ADD CONSTRAINT "tax_buffer_obligations_financial_invoice_id_fkey" FOREIGN KEY ("financial_invoice_id") REFERENCES "financial_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_buffer_obligations" ADD CONSTRAINT "tax_buffer_obligations_imported_bill_id_fkey" FOREIGN KEY ("imported_bill_id") REFERENCES "imported_bills"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_buffer_obligations" ADD CONSTRAINT "tax_buffer_obligations_imported_bank_transaction_id_fkey" FOREIGN KEY ("imported_bank_transaction_id") REFERENCES "imported_bank_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_buffer_snapshots" ADD CONSTRAINT "tax_buffer_snapshots_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_buffer_overrides" ADD CONSTRAINT "tax_buffer_overrides_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_buffer_overrides" ADD CONSTRAINT "tax_buffer_overrides_reserve_category_id_fkey" FOREIGN KEY ("reserve_category_id") REFERENCES "tax_reserve_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_buffer_overrides" ADD CONSTRAINT "tax_buffer_overrides_obligation_id_fkey" FOREIGN KEY ("obligation_id") REFERENCES "tax_buffer_obligations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_buffer_events" ADD CONSTRAINT "tax_buffer_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
