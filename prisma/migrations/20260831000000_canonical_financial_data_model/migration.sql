-- ===========================================================================
-- canonical_financial_data_model
--
-- Destructive-by-design pre-launch refactor (zero production customers).
-- See openspec/changes/canonical-financial-data-model/design.md (D1).
--
--   1. Create canonical financial tables (financial_contacts,
--      financial_invoices, financial_payments) with provenance.
--   2. Narrow tracked_invoices to chasing-workflow state (drop invoice-fact
--      columns, add financial_invoice_id FK).
--   3. Reshape customers over financial_contacts (chasing preferences only).
--   4. Retire provider_invoice_mappings / provider_contact_mappings.
--   5. Align SpendLeak foundation tables to the shared provenance vocabulary
--      and remove currency defaults.
--   6. Simplify arrangement_invoice_coverages (drop denormalised debtor_email
--      and the compound FK into tracked_invoices' removed client_email).
--
-- NOT a data migration: existing rows in the affected tables are discarded.
-- Preview/dev environments are re-seeded afterwards (scripts/seed-preview.ts).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Canonical financial tables
-- ---------------------------------------------------------------------------

CREATE TABLE "financial_contacts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "source_system" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "source_updated_at" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accounting_connection_id" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "email_lower" TEXT,
    "raw_source_data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_contacts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "financial_invoices" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "source_system" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "source_updated_at" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accounting_connection_id" TEXT,
    "contact_id" TEXT,
    "invoice_number" TEXT,
    "amount_due_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "due_date" TIMESTAMP(3) NOT NULL,
    "issue_date" TIMESTAMP(3),
    "payment_url" TEXT,
    "raw_source_data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_invoices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "financial_payments" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "source_system" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "source_updated_at" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accounting_connection_id" TEXT,
    "financial_invoice_id" TEXT,
    "amount_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "paid_at" TIMESTAMP(3) NOT NULL,
    "raw_source_data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_payments_pkey" PRIMARY KEY ("id")
);

-- Canonical provenance idempotency keys
CREATE UNIQUE INDEX "financial_contacts_user_id_source_system_source_id_key"
    ON "financial_contacts"("user_id", "source_system", "source_id");
CREATE UNIQUE INDEX "financial_contacts_user_id_email_lower_key"
    ON "financial_contacts"("user_id", "email_lower");
CREATE INDEX "financial_contacts_user_id_source_system_idx"
    ON "financial_contacts"("user_id", "source_system");

CREATE UNIQUE INDEX "financial_invoices_user_id_source_system_source_id_key"
    ON "financial_invoices"("user_id", "source_system", "source_id");
CREATE INDEX "financial_invoices_user_id_due_date_idx"
    ON "financial_invoices"("user_id", "due_date");
CREATE INDEX "financial_invoices_user_id_contact_id_idx"
    ON "financial_invoices"("user_id", "contact_id");

CREATE UNIQUE INDEX "financial_payments_user_id_source_system_source_id_key"
    ON "financial_payments"("user_id", "source_system", "source_id");
CREATE INDEX "financial_payments_user_id_paid_at_idx"
    ON "financial_payments"("user_id", "paid_at");

-- ---------------------------------------------------------------------------
-- 2. Narrow tracked_invoices to chasing-workflow state
-- ---------------------------------------------------------------------------

-- Drop FK from provider_invoice_mappings before touching tracked_invoices.
ALTER TABLE "provider_invoice_mappings"
    DROP CONSTRAINT IF EXISTS "provider_invoice_mappings_tracked_invoice_id_fkey";

ALTER TABLE "tracked_invoices"
    ADD COLUMN "financial_invoice_id" TEXT;

-- Backfill is intentionally omitted (destructive pre-launch refactor): any
-- pre-existing rows are discarded with their data columns below.
DELETE FROM "tracked_invoices";

-- Enforce NOT NULL only on the now-empty table.
ALTER TABLE "tracked_invoices"
    ALTER COLUMN "financial_invoice_id" SET NOT NULL;

ALTER TABLE "tracked_invoices"
    DROP COLUMN IF EXISTS "external_id",
    DROP COLUMN IF EXISTS "provider",
    DROP COLUMN IF EXISTS "client_email",
    DROP COLUMN IF EXISTS "client_name",
    DROP COLUMN IF EXISTS "amount_due",
    DROP COLUMN IF EXISTS "currency",
    DROP COLUMN IF EXISTS "due_date",
    DROP COLUMN IF EXISTS "payment_url";

CREATE UNIQUE INDEX "tracked_invoices_financial_invoice_id_key"
    ON "tracked_invoices"("financial_invoice_id");

ALTER TABLE "tracked_invoices"
    ADD CONSTRAINT "tracked_invoices_financial_invoice_id_fkey"
    FOREIGN KEY ("financial_invoice_id") REFERENCES "financial_invoices"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 3. Reshape customers over financial_contacts
-- ---------------------------------------------------------------------------

ALTER TABLE "customers"
    ADD COLUMN "financial_contact_id" TEXT;

-- Discarding existing rows (no identity backfill — destructive pre-launch).
DELETE FROM "customers";

ALTER TABLE "customers"
    ALTER COLUMN "financial_contact_id" SET NOT NULL,
    DROP COLUMN "primary_email",
    DROP COLUMN "primary_email_lower",
    DROP COLUMN "display_name";

CREATE UNIQUE INDEX "customers_userId_financial_contact_id_key"
    ON "customers"("userId", "financial_contact_id");

ALTER TABLE "customers"
    ADD CONSTRAINT "customers_financial_contact_id_fkey"
    FOREIGN KEY ("financial_contact_id") REFERENCES "financial_contacts"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 4. Retire provider mapping tables (absorbed into canonical provenance)
-- ---------------------------------------------------------------------------

DROP TABLE IF EXISTS "provider_invoice_mappings";
DROP TABLE IF EXISTS "provider_contact_mappings";

-- ---------------------------------------------------------------------------
-- 5. Align SpendLeak foundation tables to shared provenance vocabulary
-- ---------------------------------------------------------------------------

ALTER TABLE "imported_bills"
    RENAME COLUMN "provider_bill_id" TO "source_id";
ALTER TABLE "imported_bills"
    RENAME COLUMN "provider_contact_id" TO "source_contact_id";
ALTER TABLE "imported_bills"
    RENAME COLUMN "provider_updated_at" TO "source_updated_at";
ALTER TABLE "imported_bills"
    RENAME COLUMN "provider_metadata" TO "raw_source_data";
ALTER TABLE "imported_bills"
    ADD COLUMN "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ALTER COLUMN "currency" DROP DEFAULT;

ALTER TABLE "imported_bank_transactions"
    RENAME COLUMN "provider_transaction_id" TO "source_id";
ALTER TABLE "imported_bank_transactions"
    RENAME COLUMN "provider_contact_id" TO "source_contact_id";
ALTER TABLE "imported_bank_transactions"
    RENAME COLUMN "provider_updated_at" TO "source_updated_at";
ALTER TABLE "imported_bank_transactions"
    RENAME COLUMN "provider_metadata" TO "raw_source_data";
ALTER TABLE "imported_bank_transactions"
    ADD COLUMN "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ALTER COLUMN "currency" DROP DEFAULT;

ALTER TABLE "supplier_profiles"
    RENAME COLUMN "provider_supplier_id" TO "source_id";
ALTER TABLE "supplier_profiles"
    RENAME COLUMN "provider_metadata" TO "raw_source_data";
ALTER TABLE "supplier_profiles"
    ADD COLUMN "source_updated_at" TIMESTAMP(3),
    ADD COLUMN "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- ---------------------------------------------------------------------------
-- 6. Simplify arrangement_invoice_coverages
-- ---------------------------------------------------------------------------

ALTER TABLE "arrangement_invoice_coverages"
    DROP CONSTRAINT IF EXISTS "arrangement_invoice_coverages_tracked_invoice_id_user_id_debtor_email_fkey",
    DROP CONSTRAINT IF EXISTS "arrangement_invoice_coverages_arrangement_id_user_id_debtor_email_fkey";

CREATE UNIQUE INDEX IF NOT EXISTS "arrangements_id_user_id_key"
    ON "arrangements"("id", "user_id");

ALTER TABLE "arrangement_invoice_coverages"
    DROP COLUMN "debtor_email";

ALTER TABLE "arrangement_invoice_coverages"
    ADD CONSTRAINT "arrangement_invoice_coverages_arrangement_id_user_id_fkey"
    FOREIGN KEY ("arrangement_id", "user_id") REFERENCES "arrangements"("id", "user_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Foreign keys on the canonical tables
-- ---------------------------------------------------------------------------

ALTER TABLE "financial_contacts"
    ADD CONSTRAINT "financial_contacts_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "user_profiles"("userId")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "financial_contacts"
    ADD CONSTRAINT "financial_contacts_accounting_connection_id_fkey"
    FOREIGN KEY ("accounting_connection_id") REFERENCES "accounting_connections"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "financial_invoices"
    ADD CONSTRAINT "financial_invoices_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "user_profiles"("userId")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "financial_invoices"
    ADD CONSTRAINT "financial_invoices_accounting_connection_id_fkey"
    FOREIGN KEY ("accounting_connection_id") REFERENCES "accounting_connections"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "financial_invoices"
    ADD CONSTRAINT "financial_invoices_contact_id_fkey"
    FOREIGN KEY ("contact_id") REFERENCES "financial_contacts"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "financial_payments"
    ADD CONSTRAINT "financial_payments_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "user_profiles"("userId")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "financial_payments"
    ADD CONSTRAINT "financial_payments_accounting_connection_id_fkey"
    FOREIGN KEY ("accounting_connection_id") REFERENCES "accounting_connections"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "financial_payments"
    ADD CONSTRAINT "financial_payments_financial_invoice_id_fkey"
    FOREIGN KEY ("financial_invoice_id") REFERENCES "financial_invoices"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Arrangement compound unique supporting the coverage FK above.
CREATE UNIQUE INDEX IF NOT EXISTS "arrangements_id_user_id_key"
    ON "arrangements"("id", "user_id");
