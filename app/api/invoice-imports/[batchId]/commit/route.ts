import { NextResponse } from "next/server"

import { withUserContext } from "@/lib/db/withUserContext"
import { findOrCreateCustomer } from "@/lib/db/customers"
import { parseInvoiceImportDate, parseInvoiceImportMoney } from "@/lib/invoiceImport/mapping"
import {
  INVOICE_IMPORT_PROVIDER,
  TERMINAL_TRACKED_INVOICE_STATUSES,
  isInvoiceImportDuplicateMode,
  resolveInvoiceImportExternalId,
} from "@/lib/invoiceImport/matching"
import type { InvoiceImportCanonicalField } from "@/lib/invoiceImport/template"
import { createClient } from "@/lib/supabase/server"
import { Prisma } from "@/lib/generated/prisma/client"
import { computeOutstanding, recordInvoicePayment } from "@/lib/invoices/payments"

type Params = { params: Promise<{ batchId: string }> }

type CommitResult = {
  invoicesCreated: number
  invoicesUpdated: number
  invoicesSkipped: number
  invoicesAnomalies: number
}

/** Fields carried onto TrackedInvoice.providerMetadata for audit/reference; not part of the core model. */
const METADATA_FIELDS = [
  "customer_contact_name",
  "invoice_date",
  "invoice_total",
  "purchase_order_reference",
  "payment_url",
  "invoice_description",
  "notes",
  "customer_external_id",
  "invoice_external_id",
] as const satisfies readonly InvoiceImportCanonicalField[]

function toCents(amount: number): number {
  return Math.round(amount * 100)
}

function buildProviderMetadata(
  values: Partial<Record<InvoiceImportCanonicalField, string>>,
  batchId: string,
): Prisma.InputJsonValue {
  const metadata: Record<string, string> = { importBatchId: batchId }
  for (const field of METADATA_FIELDS) {
    const value = values[field]?.trim()
    if (value) metadata[field] = value
  }
  return metadata
}

export async function POST(_request: Request, { params }: Params): Promise<NextResponse> {
  const { batchId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const result = await withUserContext(user.id, async (tx) => {
    const batch = await tx.invoiceImportBatch.findFirst({ where: { id: batchId, userId: user.id } })
    if (!batch) return { ok: false as const, reason: "not_found" as const }

    // Idempotent replay: a completed batch returns its stored result instead of recommitting.
    if (batch.status === "completed") {
      const mappingMeta = (batch.mapping ?? {}) as { commitResult?: CommitResult }
      const commitResult = mappingMeta.commitResult ?? {
        invoicesCreated: 0,
        invoicesUpdated: 0,
        invoicesSkipped: batch.rowsSkipped,
        invoicesAnomalies: 0,
      }
      return { ok: true as const, batch, commitResult, replay: true }
    }

    if (batch.status !== "validated") {
      return { ok: false as const, reason: "invalid_status" as const }
    }

    if (!isInvoiceImportDuplicateMode(batch.duplicateMode)) {
      return { ok: false as const, reason: "invalid_duplicate_mode" as const }
    }
    const duplicateMode = batch.duplicateMode

    await tx.invoiceImportBatch.update({
      where: { id: batchId },
      data: { status: "processing", startedAt: batch.startedAt ?? new Date() },
    })

    const stagingRows = await tx.invoiceImportStagingRow.findMany({
      where: { batchId, status: { in: ["valid", "warning"] } },
      orderBy: { rowNumber: "asc" },
    })

    // Ensure a shadow InvoiceConnection exists to satisfy TrackedInvoice's
    // required FK, mirroring the pattern used by the accounting sync
    // orchestrator (lib/providers/accounting/sync.ts) for non-Stripe sources.
    let invoiceConnection = await tx.invoiceConnection.findFirst({
      where: { userId: user.id, provider: INVOICE_IMPORT_PROVIDER, isActive: true },
      select: { id: true },
    })
    if (!invoiceConnection) {
      invoiceConnection = await tx.invoiceConnection.create({
        data: { userId: user.id, provider: INVOICE_IMPORT_PROVIDER, isActive: true },
        select: { id: true },
      })
    }

    const commitResult: CommitResult = {
      invoicesCreated: 0,
      invoicesUpdated: 0,
      invoicesSkipped: 0,
      invoicesAnomalies: 0,
    }

    for (const stagingRow of stagingRows) {
      const values = (stagingRow.normalized ?? {}) as Partial<Record<InvoiceImportCanonicalField, string>>
      const externalId = resolveInvoiceImportExternalId(values)
      const outstandingAmount = parseInvoiceImportMoney(values.amount_outstanding ?? "")
      const dueDate = parseInvoiceImportDate(values.due_date ?? "")

      // Already blocked at validate-time (missing/invalid fields, duplicate
      // identifiers); this guards against staging rows edited after validation.
      if (!externalId || outstandingAmount === null || dueDate === null) {
        commitResult.invoicesSkipped += 1
        continue
      }

      const existing = await tx.trackedInvoice.findUnique({
        where: {
          externalId_provider_userId: {
            externalId,
            provider: INVOICE_IMPORT_PROVIDER,
            userId: user.id,
          },
        },
        select: { id: true, status: true, amountDue: true, currency: true },
      })

      const currency = (values.currency?.trim() || batch.defaultCurrency || "usd").toLowerCase()
      const providerMetadata = buildProviderMetadata(values, batchId)
      const clientEmail = values.customer_email?.trim() ?? ""
      const clientName = values.customer_name?.trim() ?? ""
      const customer = clientEmail
        ? await findOrCreateCustomer(tx, user.id, clientEmail, clientName)
        : null

      if (!existing) {
        await tx.trackedInvoice.create({
          data: {
            userId: user.id,
            invoiceConnectionId: invoiceConnection.id,
            customerId: customer?.id,
            externalId,
            provider: INVOICE_IMPORT_PROVIDER,
            clientEmail,
            clientName,
            amountDue: toCents(outstandingAmount),
            currency,
            dueDate,
            // Imports are always created paused: reminders are only ever
            // activated by an explicit user review action (design.md).
            status: "paused",
            currentStage: 0,
            nextEmailAt: null,
            providerMetadata,
          },
        })
        commitResult.invoicesCreated += 1
        continue
      }

      if (duplicateMode === "skip_existing") {
        commitResult.invoicesSkipped += 1
        continue
      }

      // update_eligible: never reopen a terminal invoice, and never touch
      // status/currentStage/nextEmailAt so reminder history, promises-to-pay,
      // and disputes on the existing record are preserved.
      if (TERMINAL_TRACKED_INVOICE_STATUSES.has(existing.status)) {
        commitResult.invoicesSkipped += 1
        continue
      }

      // `amountDue` is the invoice's fixed original total and is never
      // overwritten here. Instead, the file's reported outstanding balance is
      // compared against the ledger-derived current outstanding balance
      // (lib/invoices/payments.ts#computeOutstanding), and the gap — if
      // any — is reconciled as an InvoicePayment so payment history is never
      // silently destroyed on re-upload (design.md).
      const existingPayments = await tx.invoicePayment.findMany({
        where: { trackedInvoiceId: existing.id },
        select: { amount: true },
      })
      const currentOutstanding = computeOutstanding({ amountDue: existing.amountDue }, existingPayments)
      const reportedOutstanding = toCents(outstandingAmount)

      if (reportedOutstanding > currentOutstanding) {
        // Anomaly: the file reports a *higher* outstanding balance than the
        // ledger currently shows. Neither auto-applying (could act on a
        // mistake) nor blocking the whole batch (too disruptive) is safe, so
        // this invoice is skipped and flagged for review instead.
        await tx.invoiceImportError.create({
          data: {
            batchId,
            rowNumber: stagingRow.rowNumber,
            invoiceNumber: values.invoice_number ?? externalId,
            fieldName: "amount_outstanding",
            errorCode: "outstanding_increased",
            message: `Reported outstanding balance (${reportedOutstanding} cents) is higher than the current outstanding balance (${currentOutstanding} cents). Row skipped — verify before re-importing.`,
            severity: "warning",
          },
        })
        commitResult.invoicesAnomalies += 1
        continue
      }

      await tx.trackedInvoice.update({
        where: { id: existing.id },
        data: {
          clientEmail,
          clientName,
          ...(customer ? { customerId: customer.id } : {}),
          currency,
          dueDate,
          providerMetadata,
        },
      })

      if (reportedOutstanding < currentOutstanding) {
        await recordInvoicePayment(
          tx,
          { id: existing.id, userId: user.id, amountDue: existing.amountDue, status: existing.status },
          {
            amount: currentOutstanding - reportedOutstanding,
            currency,
            source: "import_reconciliation",
          },
        )
      }

      commitResult.invoicesUpdated += 1
    }

    const existingMapping = (batch.mapping ?? {}) as Record<string, unknown>
    const updated = await tx.invoiceImportBatch.update({
      where: { id: batchId },
      data: {
        status: "completed",
        completedAt: new Date(),
        rowsSkipped: commitResult.invoicesSkipped,
        mapping: { ...existingMapping, commitResult } as Prisma.InputJsonValue,
      },
    })

    return { ok: true as const, batch: updated, commitResult, replay: false }
  })

  if (!result.ok) {
    if (result.reason === "not_found") {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }
    if (result.reason === "invalid_duplicate_mode") {
      return NextResponse.json({ error: "Batch has an invalid duplicate handling mode" }, { status: 400 })
    }
    return NextResponse.json({ error: "Batch is not ready for commit" }, { status: 409 })
  }

  return NextResponse.json({
    success: true,
    batchId: result.batch.id,
    status: result.batch.status,
    replay: result.replay,
    invoicesCreated: result.commitResult.invoicesCreated,
    invoicesUpdated: result.commitResult.invoicesUpdated,
    invoicesSkipped: result.commitResult.invoicesSkipped,
    invoicesAnomalies: result.commitResult.invoicesAnomalies,
  })
}
