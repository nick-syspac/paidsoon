export type ImportedSpendSourceType = "bills" | "bank_transactions"
export type ImportedSpendSummaryBucket = "unclassified" | "unconfirmed" | "unknown_direction" | "excluded"

export interface ImportedSpendRefundContext {
  sourceType: ImportedSpendSourceType
  sourceRecordId: string
  classificationStatus: string
  category: { id: string; name: string } | null
}

export interface ImportedSpendSummaryRecord {
  sourceType: ImportedSpendSourceType
  sourceRecordId: string
  amountCents: number
  currency: string
  direction: "outflow" | "inflow" | "unknown"
  sourceStatus: string | null
  classificationStatus: string | null
  category: { id: string; name: string; status: string } | null
  refundFor?: ImportedSpendRefundContext | null
}

export interface ConfirmedSpendCategoryTotal {
  sourceType: ImportedSpendSourceType
  currency: string
  categoryId: string
  categoryName: string
  amountCents: number
  recordCount: number
  sourceRecordIds: string[]
  refundRecordCount: number
  refundRecordIds: string[]
}

export interface LinkedSpendRefundCredit {
  sourceType: ImportedSpendSourceType
  currency: string
  categoryId: string
  categoryName: string
  amountCents: number
  refundRecordIds: string[]
  originalSourceType: ImportedSpendSourceType
  originalSourceRecordIds: string[]
}

export interface UnresolvedSpendTotal {
  sourceType: ImportedSpendSourceType
  currency: string
  bucket: ImportedSpendSummaryBucket
  amountCents: number
  recordCount: number
  sourceRecordIds: string[]
}

export interface SpendClassificationSummary {
  confirmed: ConfirmedSpendCategoryTotal[]
  unresolved: UnresolvedSpendTotal[]
  refundCredits: LinkedSpendRefundCredit[]
}

const UNRESOLVED_BUCKET_ORDER: ImportedSpendSummaryBucket[] = [
  "unclassified",
  "unconfirmed",
  "unknown_direction",
  "excluded",
]

export function buildSpendClassificationSummary(
  records: ImportedSpendSummaryRecord[],
): SpendClassificationSummary {
  const confirmed = new Map<string, ConfirmedSpendCategoryTotal>()
  const unresolved = new Map<string, UnresolvedSpendTotal>()
  const sameSourceRefunds = new Map<string, { amountCents: number; refundRecordIds: string[] }>()
  const crossSourceRefunds = new Map<string, LinkedSpendRefundCredit>()

  for (const record of records) {
    const currency = record.currency.trim().toUpperCase() || "UNKNOWN"
    const sourceStatus = record.sourceStatus?.trim().toLowerCase() ?? null
    let bucket: ImportedSpendSummaryBucket | null = null

    if (
      record.classificationStatus === "excluded"
      || (record.sourceType === "bills" && ["voided", "draft"].includes(sourceStatus ?? ""))
    ) {
      bucket = "excluded"
    } else if (record.direction === "inflow") {
      const original = record.refundFor
      if (
        record.classificationStatus === "confirmed" && original?.classificationStatus === "confirmed" && original.category
      ) {
        if (record.sourceType === original.sourceType) {
          const key = JSON.stringify([record.sourceType, currency, original.category.id])
          const adjustment = sameSourceRefunds.get(key) ?? { amountCents: 0, refundRecordIds: [] }
          adjustment.amountCents += Math.abs(record.amountCents)
          adjustment.refundRecordIds.push(record.sourceRecordId)
          sameSourceRefunds.set(key, adjustment)
        } else {
          const key = JSON.stringify([record.sourceType, currency, original.category.id, original.sourceType])
          const credit = crossSourceRefunds.get(key) ?? {
            sourceType: record.sourceType,
            currency,
            categoryId: original.category.id,
            categoryName: original.category.name,
            amountCents: 0,
            refundRecordIds: [],
            originalSourceType: original.sourceType,
            originalSourceRecordIds: [],
          }
          credit.amountCents += Math.abs(record.amountCents)
          credit.refundRecordIds.push(record.sourceRecordId)
          credit.originalSourceRecordIds.push(original.sourceRecordId)
          crossSourceRefunds.set(key, credit)
        }
      }
      continue
    } else if (record.direction === "unknown") {
      bucket = "unknown_direction"
    } else if (record.classificationStatus === "confirmed" && record.category) {
      const key = JSON.stringify([record.sourceType, currency, record.category.id])
      const total = confirmed.get(key) ?? {
        sourceType: record.sourceType,
        currency,
        categoryId: record.category.id,
        categoryName: record.category.name,
        amountCents: 0,
        recordCount: 0,
        sourceRecordIds: [],
        refundRecordCount: 0,
        refundRecordIds: [],
      }
      total.amountCents += Math.abs(record.amountCents)
      total.recordCount += 1
      total.sourceRecordIds.push(record.sourceRecordId)
      confirmed.set(key, total)
      continue
    } else if (record.classificationStatus === null || record.classificationStatus === "confirmed") {
      bucket = "unclassified"
    } else {
      bucket = "unconfirmed"
    }

    if (!bucket) continue
    const key = JSON.stringify([record.sourceType, currency, bucket])
    const total = unresolved.get(key) ?? {
      sourceType: record.sourceType,
      currency,
      bucket,
      amountCents: 0,
      recordCount: 0,
      sourceRecordIds: [],
    }
    total.amountCents += Math.abs(record.amountCents)
    total.recordCount += 1
    total.sourceRecordIds.push(record.sourceRecordId)
    unresolved.set(key, total)
  }

  const normalizeTraceability = <T extends { sourceRecordIds: string[] }>(rows: T[]): T[] =>
    rows.map((row) => ({
      ...row,
      sourceRecordIds: [...row.sourceRecordIds].sort((a, b) => a.localeCompare(b)),
    }))

  for (const [key, adjustment] of sameSourceRefunds) {
    const [sourceType, currency, categoryId] = JSON.parse(key) as [ImportedSpendSourceType, string, string]
    const total = confirmed.get(JSON.stringify([sourceType, currency, categoryId]))
    if (!total) continue
    total.amountCents = Math.max(0, total.amountCents - adjustment.amountCents)
    total.refundRecordCount = adjustment.refundRecordIds.length
    total.refundRecordIds.push(...adjustment.refundRecordIds)
  }

  const confirmedRows = normalizeTraceability([...confirmed.values()])
    .map((row) => ({ ...row, refundRecordIds: [...row.refundRecordIds].sort((a, b) => a.localeCompare(b)) }))
    .sort((a, b) => a.sourceType.localeCompare(b.sourceType)
      || a.currency.localeCompare(b.currency)
      || a.categoryName.localeCompare(b.categoryName)
      || a.categoryId.localeCompare(b.categoryId))
  const unresolvedRows = normalizeTraceability([...unresolved.values()])
    .sort((a, b) => a.sourceType.localeCompare(b.sourceType)
      || a.currency.localeCompare(b.currency)
      || UNRESOLVED_BUCKET_ORDER.indexOf(a.bucket) - UNRESOLVED_BUCKET_ORDER.indexOf(b.bucket))

  const refundCredits = [...crossSourceRefunds.values()]
    .map((row) => ({
      ...row,
      refundRecordIds: [...row.refundRecordIds].sort((a, b) => a.localeCompare(b)),
      originalSourceRecordIds: [...row.originalSourceRecordIds].sort((a, b) => a.localeCompare(b)),
    }))
    .sort((a, b) => a.sourceType.localeCompare(b.sourceType)
      || a.currency.localeCompare(b.currency)
      || a.categoryName.localeCompare(b.categoryName)
      || a.originalSourceType.localeCompare(b.originalSourceType))

  return { confirmed: confirmedRows, unresolved: unresolvedRows, refundCredits }
}
