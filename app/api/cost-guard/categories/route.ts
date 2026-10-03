import { NextResponse } from "next/server"
import { z } from "zod"

import { withUserContext } from "@/lib/db/withUserContext"
import {
  buildSpendClassificationSummary,
  type ImportedSpendSummaryRecord,
} from "@/lib/spendClassification/summaries"
import { createClient } from "@/lib/supabase/server"

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
})

export async function GET(request: Request): Promise<NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const parsed = QuerySchema.safeParse({
    limit: searchParams.get("limit") ?? 25,
  })

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const summary = await withUserContext(user.id, async (tx) => {
    const [bills, transactions, classifications] = await Promise.all([
      tx.importedBill.findMany({
        where: { userId: user.id },
        select: { id: true, amountCents: true, currency: true, status: true },
      }),
      tx.importedBankTransaction.findMany({
        where: { userId: user.id },
        select: { id: true, amountCents: true, currency: true, direction: true },
      }),
      tx.spendClassification.findMany({
        where: { userId: user.id },
        select: {
          sourceType: true,
          sourceRecordId: true,
          status: true,
          category: { select: { id: true, name: true, status: true } },
          refundFor: {
            select: {
              sourceType: true,
              sourceRecordId: true,
              status: true,
              category: { select: { id: true, name: true } },
            },
          },
        },
      }),
    ])
    const classificationBySource = new Map(
      classifications.map((classification) => [
        JSON.stringify([classification.sourceType, classification.sourceRecordId]),
        classification,
      ]),
    )
    const records: ImportedSpendSummaryRecord[] = [
      ...bills.map((bill) => {
        const classification = classificationBySource.get(JSON.stringify(["imported_bill", bill.id]))
        return {
          sourceType: "bills" as const,
          sourceRecordId: bill.id,
          amountCents: bill.amountCents,
          currency: bill.currency,
          direction: "outflow" as const,
          sourceStatus: bill.status,
          classificationStatus: classification?.status ?? null,
          category: classification?.category ?? null,
          refundFor: classification?.refundFor ? {
            ...classification.refundFor,
            sourceType: classification.refundFor.sourceType === "imported_bill" ? "bills" as const : "bank_transactions" as const,
            classificationStatus: classification.refundFor.status,
          } : null,
        }
      }),
      ...transactions.map((transaction) => {
        const classification = classificationBySource.get(JSON.stringify(["imported_bank_transaction", transaction.id]))
        return {
          sourceType: "bank_transactions" as const,
          sourceRecordId: transaction.id,
          amountCents: transaction.amountCents,
          currency: transaction.currency,
          direction: transaction.direction,
          sourceStatus: null,
          classificationStatus: classification?.status ?? null,
          category: classification?.category ?? null,
          refundFor: classification?.refundFor ? {
            ...classification.refundFor,
            sourceType: classification.refundFor.sourceType === "imported_bill" ? "bills" as const : "bank_transactions" as const,
            classificationStatus: classification.refundFor.status,
          } : null,
        }
      }),
    ]

    return buildSpendClassificationSummary(records)
  })

  const categories = [...summary.confirmed]
    .sort((a, b) => b.amountCents - a.amountCents
      || a.sourceType.localeCompare(b.sourceType)
      || a.currency.localeCompare(b.currency)
      || a.categoryName.localeCompare(b.categoryName))
    .slice(0, parsed.data.limit)

  return NextResponse.json({
    categories: categories.map((row) => ({
      id: row.categoryId,
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      totalSpendCents: row.amountCents,
      currency: row.currency,
      sourceType: row.sourceType,
      recordCount: row.recordCount,
      sourceRecordIds: row.sourceRecordIds,
      refundRecordCount: row.refundRecordCount,
      refundRecordIds: row.refundRecordIds,
    })),
    unresolved: summary.unresolved.map((row) => ({
      status: row.bucket,
      totalSpendCents: row.amountCents,
      currency: row.currency,
      sourceType: row.sourceType,
      recordCount: row.recordCount,
      sourceRecordIds: row.sourceRecordIds,
    })),
    refundCredits: summary.refundCredits.map((row) => ({
      sourceType: row.sourceType,
      currency: row.currency,
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      creditCents: row.amountCents,
      refundRecordIds: row.refundRecordIds,
      originalSourceType: row.originalSourceType,
      originalSourceRecordIds: row.originalSourceRecordIds,
    })),
  })
}
