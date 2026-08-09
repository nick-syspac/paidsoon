-- CreateTable
CREATE TABLE "imported_bills" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "accounting_connection_id" TEXT NOT NULL,
    "provider_bill_id" TEXT NOT NULL,
    "provider_contact_id" TEXT,
    "supplier_name" TEXT NOT NULL,
    "supplier_reference" TEXT,
    "document_number" TEXT,
    "expense_account_code" TEXT,
    "expense_account_name" TEXT,
    "amount_cents" INTEGER NOT NULL,
    "gst_cents" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "due_date" TIMESTAMP(3),
    "paid_date" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'open',
    "provider_updated_at" TIMESTAMP(3),
    "provider_metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "imported_bills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imported_bank_transactions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "accounting_connection_id" TEXT NOT NULL,
    "provider_transaction_id" TEXT NOT NULL,
    "provider_contact_id" TEXT,
    "account_name" TEXT,
    "account_code" TEXT,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "counterparty_name" TEXT,
    "amount_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "transaction_date" TIMESTAMP(3) NOT NULL,
    "provider_updated_at" TIMESTAMP(3),
    "provider_metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "imported_bank_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "accounting_connection_id" TEXT NOT NULL,
    "provider_supplier_id" TEXT NOT NULL,
    "supplier_name" TEXT NOT NULL,
    "supplier_email" TEXT,
    "abn" TEXT,
    "payment_terms" TEXT,
    "default_account_code" TEXT,
    "default_account_name" TEXT,
    "provider_metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spend_insights" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "accounting_connection_id" TEXT,
    "finding_type" TEXT NOT NULL,
    "subject_key" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'medium',
    "summary" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'open',
    "estimated_monthly_cents" INTEGER,
    "estimated_annual_cents" INTEGER,
    "evidence" JSONB NOT NULL,
    "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spend_insights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_forecast_snapshots" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "accounting_connection_id" TEXT,
    "current_cash_cents" INTEGER NOT NULL,
    "receivables_cents" INTEGER NOT NULL DEFAULT 0,
    "payables_cents" INTEGER NOT NULL DEFAULT 0,
    "predicted_month_end_cents" INTEGER,
    "runway_days" INTEGER,
    "assumptions" JSONB,
    "snapshot_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_forecast_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateUniqueIndex
CREATE UNIQUE INDEX "imported_bills_accounting_connection_id_provider_bill_id_key" ON "imported_bills"("accounting_connection_id", "provider_bill_id");

-- CreateIndex
CREATE INDEX "imported_bills_user_id_status_due_date_idx" ON "imported_bills"("user_id", "status", "due_date");

-- CreateIndex
CREATE INDEX "imported_bills_user_id_supplier_name_idx" ON "imported_bills"("user_id", "supplier_name");

-- CreateUniqueIndex
CREATE UNIQUE INDEX "imported_bank_transactions_accounting_connection_id_provider_transaction_id_key" ON "imported_bank_transactions"("accounting_connection_id", "provider_transaction_id");

-- CreateIndex
CREATE INDEX "imported_bank_transactions_user_id_transaction_date_idx" ON "imported_bank_transactions"("user_id", "transaction_date");

-- CreateIndex
CREATE INDEX "imported_bank_transactions_user_id_counterparty_name_idx" ON "imported_bank_transactions"("user_id", "counterparty_name");

-- CreateUniqueIndex
CREATE UNIQUE INDEX "supplier_profiles_accounting_connection_id_provider_supplier_id_key" ON "supplier_profiles"("accounting_connection_id", "provider_supplier_id");

-- CreateIndex
CREATE INDEX "supplier_profiles_user_id_supplier_name_idx" ON "supplier_profiles"("user_id", "supplier_name");

-- CreateUniqueIndex
CREATE UNIQUE INDEX "spend_insights_user_id_finding_type_subject_key_key" ON "spend_insights"("user_id", "finding_type", "subject_key");

-- CreateIndex
CREATE INDEX "cash_forecast_snapshots_user_id_snapshot_at_idx" ON "cash_forecast_snapshots"("user_id", "snapshot_at");

-- AddForeignKey
ALTER TABLE "imported_bills" ADD CONSTRAINT "imported_bills_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imported_bills" ADD CONSTRAINT "imported_bills_accounting_connection_id_fkey" FOREIGN KEY ("accounting_connection_id") REFERENCES "accounting_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imported_bank_transactions" ADD CONSTRAINT "imported_bank_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imported_bank_transactions" ADD CONSTRAINT "imported_bank_transactions_accounting_connection_id_fkey" FOREIGN KEY ("accounting_connection_id") REFERENCES "accounting_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_profiles" ADD CONSTRAINT "supplier_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_profiles" ADD CONSTRAINT "supplier_profiles_accounting_connection_id_fkey" FOREIGN KEY ("accounting_connection_id") REFERENCES "accounting_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spend_insights" ADD CONSTRAINT "spend_insights_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spend_insights" ADD CONSTRAINT "spend_insights_accounting_connection_id_fkey" FOREIGN KEY ("accounting_connection_id") REFERENCES "accounting_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_forecast_snapshots" ADD CONSTRAINT "cash_forecast_snapshots_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_forecast_snapshots" ADD CONSTRAINT "cash_forecast_snapshots_accounting_connection_id_fkey" FOREIGN KEY ("accounting_connection_id") REFERENCES "accounting_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
