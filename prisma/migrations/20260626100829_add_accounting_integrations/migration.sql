-- AlterTable
ALTER TABLE "tracked_invoices" ADD COLUMN     "provider_metadata" JSONB;

-- CreateTable
CREATE TABLE "accounting_connections" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL,
    "organisation_name" TEXT NOT NULL,
    "encrypted_access_token" TEXT NOT NULL,
    "encrypted_refresh_token" TEXT NOT NULL,
    "token_expires_at" TIMESTAMP(3) NOT NULL,
    "scopes" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounting_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_sync_runs" (
    "id" TEXT NOT NULL,
    "accounting_connection_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'running',
    "invoices_created" INTEGER NOT NULL DEFAULT 0,
    "invoices_updated" INTEGER NOT NULL DEFAULT 0,
    "invoices_skipped" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,

    CONSTRAINT "accounting_sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_invoice_mappings" (
    "id" TEXT NOT NULL,
    "tracked_invoice_id" TEXT NOT NULL,
    "accounting_connection_id" TEXT NOT NULL,
    "provider_invoice_id" TEXT NOT NULL,
    "provider_updated_at" TIMESTAMP(3),
    "provider_metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_invoice_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_contact_mappings" (
    "id" TEXT NOT NULL,
    "accounting_connection_id" TEXT NOT NULL,
    "provider_contact_id" TEXT NOT NULL,
    "contact_name" TEXT,
    "contact_email" TEXT,
    "provider_metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_contact_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_states" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "accounting_connections_userId_provider_organisation_id_key" ON "accounting_connections"("userId", "provider", "organisation_id");

-- CreateIndex
CREATE INDEX "accounting_sync_runs_accounting_connection_id_started_at_idx" ON "accounting_sync_runs"("accounting_connection_id", "started_at");

-- CreateIndex
CREATE INDEX "accounting_sync_runs_userId_started_at_idx" ON "accounting_sync_runs"("userId", "started_at");

-- CreateIndex
CREATE UNIQUE INDEX "provider_invoice_mappings_tracked_invoice_id_key" ON "provider_invoice_mappings"("tracked_invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "provider_invoice_mappings_provider_invoice_id_accounting_co_key" ON "provider_invoice_mappings"("provider_invoice_id", "accounting_connection_id");

-- CreateIndex
CREATE UNIQUE INDEX "provider_contact_mappings_provider_contact_id_accounting_co_key" ON "provider_contact_mappings"("provider_contact_id", "accounting_connection_id");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_states_nonce_key" ON "oauth_states"("nonce");

-- CreateIndex
CREATE INDEX "oauth_states_nonce_idx" ON "oauth_states"("nonce");

-- CreateIndex
CREATE INDEX "oauth_states_expires_at_idx" ON "oauth_states"("expires_at");

-- AddForeignKey
ALTER TABLE "accounting_connections" ADD CONSTRAINT "accounting_connections_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_sync_runs" ADD CONSTRAINT "accounting_sync_runs_accounting_connection_id_fkey" FOREIGN KEY ("accounting_connection_id") REFERENCES "accounting_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_invoice_mappings" ADD CONSTRAINT "provider_invoice_mappings_tracked_invoice_id_fkey" FOREIGN KEY ("tracked_invoice_id") REFERENCES "tracked_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_invoice_mappings" ADD CONSTRAINT "provider_invoice_mappings_accounting_connection_id_fkey" FOREIGN KEY ("accounting_connection_id") REFERENCES "accounting_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_contact_mappings" ADD CONSTRAINT "provider_contact_mappings_accounting_connection_id_fkey" FOREIGN KEY ("accounting_connection_id") REFERENCES "accounting_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
