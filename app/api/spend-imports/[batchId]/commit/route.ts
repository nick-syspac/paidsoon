import { createHash } from "node:crypto"

import { NextResponse } from "next/server"

import { withUserContext } from "@/lib/db/withUserContext"
import { parseSpendImportDate, parseSpendImportMoney } from "@/lib/spendImport/mapping"
import { type SpendImportCanonicalField } from "@/lib/spendImport/template"
import { createClient } from "@/lib/supabase/server"
import { detectSpendFindings } from "@/lib/spendleak/engine"
import { upsertSpendFindings } from "@/lib/spendleak/persist"
import { Prisma } from "@/lib/generated/prisma/client"

type Params = { params: Promise<{ batchId: string }> }

type CommitResult = {
  recordsUpserted: number
  findingsUpserted: number
  recordsSkipped: number
}

const SPEND_IMPORT_CONNECTION_PROVIDER = "csv_import"
const SPEND_IMPORT_CONNECTION_ORG = "spend-import"

function toCents(amount: number): number {
  return Math.round(amount * 100)
}

function buildSourceId(values: Partial<Record<SpendImportCanonicalField, string>>, rowNumber: number): string {
  const explicitId = values.expense_id?.trim()
  if (explicitId) return explicitId

  const fingerprint = createHash("sha256")
    .update(JSON.stringify({
      supplier: values.supplier_name ?? "",
      amount: values.amount ?? "",
      date: values.transaction_date ?? "",
      reference: values.reference ?? "",
      rowNumber,
    }))
    .digest("hex")

  return `spend-import-${fingerprint.slice(0, 24)}`
}

function normalizeSourceType(value: string | undefined): "bill" | "transaction" {
  if (!value) return "bill"
  return value.trim().toLowerCase() === "transaction" ? "transaction" : "bill"
}

function asJsonValue(value: Record<string, unknown>): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue
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
    const batch = await tx.spendImportBatch.findFirst({ where: { id: batchId, userId: user.id } })
    if (!batch) return { ok: false as const, reason: "not_found" as const }

    if (batch.status === "completed") {
      const mappingMeta = (batch.mapping ?? {}) as { commitResult?: CommitResult }
      const commitResult = mappingMeta.commitResult ?? {
        recordsUpserted: 0,
        findingsUpserted: 0,
        recordsSkipped: batch.rowsSkipped,
      }
      return { ok: true as const, batch, commitResult, replay: true }
    }

    if (batch.status !== "validated") {
      return { ok: false as const, reason: "invalid_status" as const }
    }

    await tx.spendImportBatch.update({
      where: { id: batchId },
      data: { status: "processing", startedAt: batch.startedAt ?? new Date() },
    })

    const rows = await tx.spendImportStagingRow.findMany({
      where: { batchId, status: { in: ["valid", "warning"] } },
      orderBy: { rowNumber: "asc" },
    })

    let sourceConnection = await tx.accountingConnection.findFirst({
      where: {
        userId: user.id,
        provider: SPEND_IMPORT_CONNECTION_PROVIDER,
        organisationId: SPEND_IMPORT_CONNECTION_ORG,
      },
      select: { id: true },
    })

    if (!sourceConnection) {
      sourceConnection = await tx.accountingConnection.create({
        data: {
          userId: user.id,
          provider: SPEND_IMPORT_CONNECTION_PROVIDER,
          organisationId: SPEND_IMPORT_CONNECTION_ORG,
          organisationName: "Spend import",
          encryptedAccessToken: "n/a",
          encryptedRefreshToken: "n/a",
          tokenExpiresAt: new Date("2099-01-01T00:00:00.000Z"),
          scopes: "read_only",
          status: "active",
        },
        select: { id: true },
      })
    }

    const commitResult: CommitResult = {
      recordsUpserted: 0,
      findingsUpserted: 0,
      recordsSkipped: 0,
    }

    for (const row of rows) {
      const values = (row.normalized ?? {}) as Partial<Record<SpendImportCanonicalField, string>>
      const supplierName = values.supplier_name?.trim() ?? ""
      const amount = parseSpendImportMoney(values.amount ?? "")
      const transactionDate = parseSpendImportDate(values.transaction_date ?? "")

      if (!supplierName || amount === null || transactionDate === null) {
        commitResult.recordsSkipped += 1
        continue
      }

      const sourceId = buildSourceId(values, row.rowNumber)
      const currency = (values.currency?.trim() || batch.defaultCurrency || "AUD").toUpperCase()
      const sourceType = normalizeSourceType(values.source_type)
      const evidenceSourceData = {
        importBatchId: batchId,
        sourceType,
        rowNumber: row.rowNumber,
      }

      const supplierSourceId = `supplier:${supplierName.trim().toLowerCase()}`
      await tx.supplierProfile.upsert({
        where: {
          accountingConnectionId_sourceId: {
            accountingConnectionId: sourceConnection.id,
            sourceId: supplierSourceId,
          },
        },
        create: {
          userId: user.id,
          accountingConnectionId: sourceConnection.id,
          sourceId: supplierSourceId,
          supplierName,
          syncedAt: new Date(),
          rawSourceData: asJsonValue(evidenceSourceData),
        },
        update: {
          supplierName,
          syncedAt: new Date(),
          rawSourceData: asJsonValue(evidenceSourceData),
        },
      })

      if (sourceType === "transaction") {
        await tx.importedBankTransaction.upsert({
          where: {
            accountingConnectionId_sourceId: {
              accountingConnectionId: sourceConnection.id,
              sourceId,
            },
          },
          create: {
            userId: user.id,
            accountingConnectionId: sourceConnection.id,
            sourceId,
            sourceContactId: supplierSourceId,
            accountName: values.account_name?.trim() || null,
            accountCode: values.account_code?.trim() || null,
            description: values.description?.trim() || values.reference?.trim() || "Imported spend transaction",
            reference: values.reference?.trim() || null,
            counterpartyName: supplierName,
            amountCents: -Math.abs(toCents(amount)),
            currency,
            transactionDate,
            syncedAt: new Date(),
            rawSourceData: asJsonValue({
              ...evidenceSourceData,
              values,
            }),
          },
          update: {
            sourceContactId: supplierSourceId,
            accountName: values.account_name?.trim() || null,
            accountCode: values.account_code?.trim() || null,
            description: values.description?.trim() || values.reference?.trim() || "Imported spend transaction",
            reference: values.reference?.trim() || null,
            counterpartyName: supplierName,
            amountCents: -Math.abs(toCents(amount)),
            currency,
            transactionDate,
            syncedAt: new Date(),
            rawSourceData: asJsonValue({
              ...evidenceSourceData,
              values,
            }),
          },
        })
      } else {
        const dueDate = parseSpendImportDate(values.due_date ?? "")
        await tx.importedBill.upsert({
          where: {
            accountingConnectionId_sourceId: {
              accountingConnectionId: sourceConnection.id,
              sourceId,
            },
          },
          create: {
            userId: user.id,
            accountingConnectionId: sourceConnection.id,
            sourceId,
            sourceContactId: supplierSourceId,
            supplierName,
            supplierReference: values.reference?.trim() || null,
            documentNumber: values.reference?.trim() || null,
            expenseAccountCode: values.account_code?.trim() || null,
            expenseAccountName: values.account_name?.trim() || null,
            amountCents: Math.abs(toCents(amount)),
            gstCents: null,
            currency,
            dueDate,
            paidDate: transactionDate,
            status: values.status?.trim() || "paid",
            syncedAt: new Date(),
            rawSourceData: asJsonValue({
              ...evidenceSourceData,
              values,
            }),
          },
          update: {
            sourceContactId: supplierSourceId,
            supplierName,
            supplierReference: values.reference?.trim() || null,
            documentNumber: values.reference?.trim() || null,
            expenseAccountCode: values.account_code?.trim() || null,
            expenseAccountName: values.account_name?.trim() || null,
            amountCents: Math.abs(toCents(amount)),
            currency,
            dueDate,
            paidDate: transactionDate,
            status: values.status?.trim() || "paid",
            syncedAt: new Date(),
            rawSourceData: asJsonValue({
              ...evidenceSourceData,
              values,
            }),
          },
        })
      }

      commitResult.recordsUpserted += 1
    }

    const [bills, bankTransactions, suppliers] = await Promise.all([
      tx.importedBill.findMany({ where: { userId: user.id } }),
      tx.importedBankTransaction.findMany({ where: { userId: user.id } }),
      tx.supplierProfile.findMany({ where: { userId: user.id } }),
    ])

    const findings = detectSpendFindings({
      bills: bills.map((bill) => ({
        sourceId: bill.sourceId,
        supplierName: bill.supplierName,
        amountCents: bill.amountCents,
        dueDate: bill.dueDate,
        paidDate: bill.paidDate,
        status: bill.status,
        sourceUpdatedAt: bill.sourceUpdatedAt,
      })),
      bankTransactions: bankTransactions.map((txRow) => ({
        sourceId: txRow.sourceId,
        description: txRow.description,
        amountCents: txRow.amountCents,
        transactionDate: txRow.transactionDate,
        counterpartyName: txRow.counterpartyName,
      })),
      suppliers: suppliers.map((supplier) => ({
        sourceId: supplier.sourceId,
        supplierName: supplier.supplierName,
      })),
      now: new Date(),
    }).map((finding) => ({
      ...finding,
      evidence: {
        ...finding.evidence,
        source: "expense_import",
      },
    }))

    const findingsUpserted = await upsertSpendFindings({
      userId: user.id,
      accountingConnectionId: sourceConnection.id,
      findings,
      spendInsightDelegate: tx.spendInsight,
    })
    commitResult.findingsUpserted = findingsUpserted

    const existingMapping = (batch.mapping ?? {}) as Record<string, unknown>
    const updated = await tx.spendImportBatch.update({
      where: { id: batchId },
      data: {
        status: "completed",
        completedAt: new Date(),
        rowsSkipped: commitResult.recordsSkipped,
        mapping: { ...existingMapping, commitResult } as Prisma.InputJsonValue,
      },
    })

    return { ok: true as const, batch: updated, commitResult, replay: false }
  })

  if (!result.ok) {
    if (result.reason === "not_found") {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }
    return NextResponse.json({ error: "Batch is not ready for commit" }, { status: 409 })
  }

  return NextResponse.json({
    success: true,
    batchId: result.batch.id,
    status: result.batch.status,
    replay: result.replay,
    recordsUpserted: result.commitResult.recordsUpserted,
    findingsUpserted: result.commitResult.findingsUpserted,
    recordsSkipped: result.commitResult.recordsSkipped,
  })
}
