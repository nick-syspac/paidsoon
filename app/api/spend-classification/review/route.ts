import { NextResponse } from "next/server"
import { z } from "zod"

import { getAuthenticatedSpendClassificationUserId } from "@/lib/spendClassification/api"
import {
  listSpendClassificationReview,
  SPEND_CLASSIFICATION_REVIEW_STATUSES,
} from "@/lib/spendClassification/review"

const querySchema = z.object({
  status: z.enum(SPEND_CLASSIFICATION_REVIEW_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
}).strict()

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function mapRuleMatchConfig(ruleType: string | undefined, config: unknown): Record<string, string> | null {
  const record = asRecord(config)
  if (!record) return null
  if (ruleType === "source_account") {
    return {
      ...(typeof record.accountCode === "string" ? { accountCode: record.accountCode } : {}),
      ...(typeof record.accountName === "string" ? { accountName: record.accountName } : {}),
    }
  }
  if (ruleType === "merchant" && typeof record.merchantName === "string") return { merchantName: record.merchantName }
  if (ruleType === "text_match" && typeof record.phrase === "string") return { phrase: record.phrase }
  return null
}

function toReviewItem(item: Awaited<ReturnType<typeof listSpendClassificationReview>>[number]) {
  const bill = item.importedBill
  const transaction = item.importedBankTransaction
  const source = bill
    ? {
        type: "imported_bill" as const,
        recordId: bill.id,
        merchantName: bill.supplierName,
        reference: bill.documentNumber,
        direction: "outflow" as const,
        amountCents: bill.amountCents,
        currency: bill.currency,
        status: bill.status,
        transactionDate: bill.paidDate ?? bill.dueDate,
        expenseAccountCode: bill.expenseAccountCode,
        expenseAccountName: bill.expenseAccountName,
        accountingProvider: bill.accountingConnection.provider,
        accountingOrganisation: bill.accountingConnection.organisationName,
      }
    : transaction
      ? {
          type: "imported_bank_transaction" as const,
          recordId: transaction.id,
          merchantName: transaction.counterpartyName,
          description: transaction.description,
          direction: transaction.direction,
          amountCents: transaction.amountCents,
          currency: transaction.currency,
          transactionDate: transaction.transactionDate,
          expenseAccountCode: transaction.expenseAccountCode,
          expenseAccountName: transaction.expenseAccountName,
          accountingProvider: transaction.accountingConnection.provider,
          accountingOrganisation: transaction.accountingConnection.organisationName,
        }
      : null

  return {
    id: item.id,
    source,
    status: item.status,
    origin: item.origin,
    category: item.category,
    confidence: item.confidence,
    probabilities: item.probabilities,
    model: item.model,
    lastErrorCode: item.lastErrorCode,
    attemptCount: item.attemptCount,
    updatedAt: item.updatedAt,
    refundForClassificationId: item.refundForClassificationId,
    refundFor: item.refundFor
      ? {
          id: item.refundFor.id,
          sourceType: item.refundFor.sourceType,
          merchantName: item.refundFor.importedBill?.supplierName
            ?? item.refundFor.importedBankTransaction?.counterpartyName,
          description: item.refundFor.importedBill?.documentNumber
            ?? item.refundFor.importedBankTransaction?.description,
          amountCents: item.refundFor.importedBill?.amountCents
            ?? item.refundFor.importedBankTransaction?.amountCents
            ?? null,
          currency: item.refundFor.importedBill?.currency
            ?? item.refundFor.importedBankTransaction?.currency
            ?? null,
          category: item.refundFor.category,
        }
      : null,
    matchedRule: item.rule
      ? {
          id: item.rule.id,
          name: item.rule.name,
          ruleType: item.rule.ruleType,
          matchCriteria: mapRuleMatchConfig(item.rule.ruleType, item.rule.matchConfig),
        }
      : null,
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  const userId = await getAuthenticatedSpendClassificationUserId()
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = new URL(request.url)
  const parsed = querySchema.safeParse({
    status: url.searchParams.get("status") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
    offset: url.searchParams.get("offset") ?? undefined,
  })
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  try {
    const items = await listSpendClassificationReview(userId, parsed.data)
    return NextResponse.json({ items: items.map(toReviewItem) })
  } catch {
    console.error("[GET /api/spend-classification/review] Failed to load review records")
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
