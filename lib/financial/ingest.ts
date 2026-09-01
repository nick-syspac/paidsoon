/**
 * Canonical financial-layer ingestion helpers.
 *
 * Every source of financial data (Xero, MYOB, Stripe, CSV/XLSX) funnels through
 * these helpers so that normalized records land in the canonical tables with
 * consistent provenance (`sourceSystem`, `sourceId`, `sourceUpdatedAt`,
 * `syncedAt`, `rawSourceData`) and a single idempotency key
 * `(userId, sourceSystem, sourceId)`.
 *
 * Design: openspec/changes/canonical-financial-data-model (D1–D7).
 *
 * These helpers accept any Prisma transaction-capable client (`PrismaTx` from
 * `withUserContext`, or `prismaAdmin` for cron/webhook contexts) — the caller
 * is responsible for RLS posture.
 */

import type { PrismaTx } from "@/lib/db/withUserContext"
import { Prisma } from "@/lib/generated/prisma/client"

/** Supported ingestion sources. */
export type SourceSystem = "xero" | "myob" | "stripe" | "csv"

function asJson(value: Record<string, unknown> | undefined | null) {
  return value != null ? (value as Prisma.InputJsonValue) : Prisma.DbNull
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

export interface CanonicalContactInput {
  userId: string
  sourceSystem: SourceSystem
  /**
   * Provider's contact ID. For sources without one (Stripe, CSV) pass a
   * synthetic stable id such as `email:<lowercased-email>`.
   */
  sourceId: string
  accountingConnectionId?: string | null
  sourceUpdatedAt?: Date | null
  name: string
  email?: string | null
  rawSourceData?: Record<string, unknown> | null
}

/**
 * Upsert a canonical contact by `(userId, sourceSystem, sourceId)`. The unique
 * `(userId, emailLower)` index means a contact with an email is also
 * discoverable per-tenant by email regardless of source.
 */
export async function upsertFinancialContact(
  db: PrismaTx,
  input: CanonicalContactInput,
) {
  const emailLower = input.email?.trim().toLowerCase() || null
  const name = input.name.trim()

  return db.financialContact.upsert({
    where: {
      userId_sourceSystem_sourceId: {
        userId: input.userId,
        sourceSystem: input.sourceSystem,
        sourceId: input.sourceId,
      },
    },
    update: {
      name,
      email: input.email?.trim() || null,
      emailLower,
      sourceUpdatedAt: input.sourceUpdatedAt ?? null,
      syncedAt: new Date(),
      rawSourceData: asJson(input.rawSourceData),
    },
    create: {
      userId: input.userId,
      sourceSystem: input.sourceSystem,
      sourceId: input.sourceId,
      accountingConnectionId: input.accountingConnectionId ?? null,
      sourceUpdatedAt: input.sourceUpdatedAt ?? null,
      name,
      email: input.email?.trim() || null,
      emailLower,
      rawSourceData: asJson(input.rawSourceData),
    },
  })
}

/**
 * Look up a tenant's canonical contact by email (case-insensitive), used when a
 * source has no stable provider contact id and we want to reuse an existing
 * contact across sources (e.g. CSV and Stripe referencing the same debtor).
 */
export async function findFinancialContactByEmail(
  db: PrismaTx,
  userId: string,
  email: string,
) {
  return db.financialContact.findUnique({
    where: { userId_emailLower: { userId, emailLower: email.trim().toLowerCase() } },
  })
}

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

export interface CanonicalInvoiceInput {
  userId: string
  sourceSystem: SourceSystem
  sourceId: string
  accountingConnectionId?: string | null
  sourceUpdatedAt?: Date | null
  contactId?: string | null
  invoiceNumber?: string | null
  /** Fixed original invoice total in cents (NOT current outstanding). */
  amountDueCents: number
  /** ISO 4217 currency code; normalized to lowercase. */
  currency: string
  dueDate: Date
  issueDate?: Date | null
  paymentUrl?: string | null
  rawSourceData?: Record<string, unknown> | null
}

/**
 * Upsert a canonical invoice by `(userId, sourceSystem, sourceId)`. Returns the
 * canonical record and whether it was created (for sync observability counters).
 */
export async function upsertFinancialInvoice(
  db: PrismaTx,
  input: CanonicalInvoiceInput,
): Promise<{ invoice: { id: string }; created: boolean }> {
  const key = {
    userId: input.userId,
    sourceSystem: input.sourceSystem,
    sourceId: input.sourceId,
  }
  const existing = await db.financialInvoice.findUnique({
    where: { userId_sourceSystem_sourceId: key },
    select: { id: true },
  })

  const data = {
    contactId: input.contactId ?? null,
    invoiceNumber: input.invoiceNumber ?? null,
    amountDueCents: input.amountDueCents,
    currency: input.currency.toLowerCase(),
    dueDate: input.dueDate,
    issueDate: input.issueDate ?? null,
    paymentUrl: input.paymentUrl ?? null,
    sourceUpdatedAt: input.sourceUpdatedAt ?? null,
    rawSourceData: asJson(input.rawSourceData),
  }

  if (existing) {
    const invoice = await db.financialInvoice.update({
      where: { id: existing.id },
      data: { ...data, syncedAt: new Date() },
      select: { id: true },
    })
    return { invoice, created: false }
  }

  const invoice = await db.financialInvoice.create({
    data: {
      userId: input.userId,
      sourceSystem: input.sourceSystem,
      sourceId: input.sourceId,
      accountingConnectionId: input.accountingConnectionId ?? null,
      ...data,
    },
    select: { id: true },
  })
  return { invoice, created: true }
}
