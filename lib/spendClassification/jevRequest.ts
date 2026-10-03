import "server-only"

import { withUserContext } from "@/lib/db/withUserContext"
import {
  classifySpendWithJev,
  type JevCategoryOption,
  type JevClassification,
  type JevSdkClient,
  type JevSpendState,
} from "@/lib/spendClassification/jevClient"
import type { ImportedSpendSourceType } from "@/lib/spendClassification/assignments"

type SourceContext = {
  description?: string | null
  merchant?: string | null
  direction: JevSpendState["direction"]
  currency?: string | null
}

type RequestContext = {
  state: JevSpendState
  categories: JevCategoryOption[]
}

export type JevRequestResult =
  | { status: "opted_out" }
  | { status: "not_eligible" }
  | { status: "requested"; result: JevClassification }

const SAFE_TEXT_LIMIT = 160
const EMAIL_PATTERN = /\b[\w.+-]+@[\w.-]+\.[A-Z]{2,}\b/giu
const PHONE_PATTERN = /(?:\+?\d[\d().\s-]{7,}\d)/gu
const REFERENCE_PATTERN = /\b(?:ref(?:erence)?|invoice(?:\s*(?:number|no\.?))?|document\s*(?:number|no\.?))\s*[:#-]?\s*[A-Z0-9][A-Z0-9/_-]{1,}\b/giu

function sanitizeClassificationText(value: string | null | undefined): string | undefined {
  const sanitized = value
    ?.normalize("NFKC")
    .replace(/[\p{Cc}\p{Cf}]/gu, " ")
    .replace(EMAIL_PATTERN, " ")
    .replace(PHONE_PATTERN, " ")
    .replace(REFERENCE_PATTERN, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, SAFE_TEXT_LIMIT)
    .trim()

  return sanitized || undefined
}

export function buildMinimizedJevSpendState(source: SourceContext): JevSpendState {
  const description = sanitizeClassificationText(source.description)
  const merchant = sanitizeClassificationText(source.merchant)
  const currency = source.currency?.trim().toUpperCase()
  return {
    ...(description ? { description } : {}),
    ...(merchant ? { merchant } : {}),
    direction: source.direction,
    ...(currency && /^[A-Z]{3}$/u.test(currency) ? { currency } : {}),
  }
}

async function loadOptedInRequestContext(
  userId: string,
  sourceType: ImportedSpendSourceType,
  sourceRecordId: string,
): Promise<{ optedIn: false } | { optedIn: true; context: RequestContext | null }> {
  return withUserContext(userId, async (tx) => {
    const setting = await tx.spendClassificationSetting.findUnique({
      where: { userId },
      select: { enabled: true },
    })
    if (!setting?.enabled) return { optedIn: false }

    const assignment = await tx.spendClassification.findFirst({
      where: {
        userId,
        sourceType,
        sourceRecordId,
        status: { in: ["queued", "processing"] },
        OR: [{ origin: null }, { origin: { not: "manual" } }],
      },
      select: { id: true },
    })
    if (!assignment) return { optedIn: true, context: null }

    const source = sourceType === "imported_bill"
      ? await tx.importedBill.findFirst({
          where: { id: sourceRecordId, userId },
          select: { supplierName: true, currency: true },
        }).then((bill) => bill && ({
          merchant: bill.supplierName,
          direction: "outflow" as const,
          currency: bill.currency,
        }))
      : await tx.importedBankTransaction.findFirst({
          where: { id: sourceRecordId, userId },
          select: { description: true, direction: true, currency: true },
        }).then((transaction) => transaction && ({
          description: transaction.description,
          direction: transaction.direction,
          currency: transaction.currency,
        }))
    if (!source) return { optedIn: true, context: null }

    const categories = await tx.spendCategory.findMany({
      where: { userId, status: "active" },
      select: { id: true, name: true, description: true },
      orderBy: { createdAt: "asc" },
    })
    if (categories.length === 0) return { optedIn: true, context: null }

    return {
      optedIn: true,
      context: {
        state: buildMinimizedJevSpendState(source),
        categories,
      },
    }
  })
}

/** Requests a suggestion only for queued work when the tenant has explicitly enabled external classification. */
export async function requestJevSuggestionForSpend(
  userId: string,
  sourceType: ImportedSpendSourceType,
  sourceRecordId: string,
  client?: JevSdkClient,
): Promise<JevRequestResult> {
  const request = await loadOptedInRequestContext(userId, sourceType, sourceRecordId)
  if (!request.optedIn) return { status: "opted_out" }
  if (!request.context) return { status: "not_eligible" }

  const result = await classifySpendWithJev(request.context.state, request.context.categories, client)
  return { status: "requested", result }
}
