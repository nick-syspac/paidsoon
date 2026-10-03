import { normalizeMarginCostClass, type MarginCostClass } from "@/lib/marginguard/classification"

export interface MarginSpendingCategoryContextRow {
  sourceType: "imported_bill" | "imported_bank_transaction"
  currency: string
  categoryId: string
  categoryName: string
  marginCostClass: MarginCostClass
  amountCents: number
  recordCount: number
  sourceRecordIds: string[]
}

export function buildMarginSpendingCategoryContext(input: {
  importedBills: Array<{ id: string; amountCents: number; currency: string; status: string }>
  importedBankTransactions: Array<{
    id: string
    amountCents: number
    currency: string
    direction: "outflow" | "inflow" | "unknown"
  }>
  spendClassifications: Array<{
    sourceType: string
    sourceRecordId: string
    status: string
    category: { id: string; name: string } | null
  }>
  marginClassifications: Array<{ sourceType: string; sourceRecordId: string; classification: string }>
}): MarginSpendingCategoryContextRow[] {
  const confirmedBySource = new Map(
    input.spendClassifications
      .filter((classification) => classification.status === "confirmed" && classification.category)
      .map((classification) => [
        JSON.stringify([classification.sourceType, classification.sourceRecordId]),
        classification.category,
      ]),
  )
  const marginClassBySource = new Map(
    input.marginClassifications.map((classification) => [
      JSON.stringify([classification.sourceType, classification.sourceRecordId]),
      normalizeMarginCostClass(classification.classification),
    ]),
  )
  const totals = new Map<string, MarginSpendingCategoryContextRow>()

  const addRecord = (record: {
    sourceType: "imported_bill" | "imported_bank_transaction"
    sourceRecordId: string
    amountCents: number
    currency: string
  }): void => {
    const sourceKey = JSON.stringify([record.sourceType, record.sourceRecordId])
    const category = confirmedBySource.get(sourceKey)
    if (!category) return

    const currency = record.currency.trim().toUpperCase() || "UNKNOWN"
    const marginCostClass = marginClassBySource.get(sourceKey) ?? "UNCLASSIFIED"
    const key = JSON.stringify([record.sourceType, currency, category.id, marginCostClass])
    const total = totals.get(key) ?? {
      sourceType: record.sourceType,
      currency,
      categoryId: category.id,
      categoryName: category.name,
      marginCostClass,
      amountCents: 0,
      recordCount: 0,
      sourceRecordIds: [],
    }
    total.amountCents += Math.abs(record.amountCents)
    total.recordCount += 1
    total.sourceRecordIds.push(record.sourceRecordId)
    totals.set(key, total)
  }

  for (const bill of input.importedBills) {
    const status = bill.status.trim().toLowerCase()
    if (status === "voided" || status === "draft") continue
    addRecord({
      sourceType: "imported_bill",
      sourceRecordId: bill.id,
      amountCents: bill.amountCents,
      currency: bill.currency,
    })
  }

  for (const transaction of input.importedBankTransactions) {
    if (transaction.direction !== "outflow") continue
    addRecord({
      sourceType: "imported_bank_transaction",
      sourceRecordId: transaction.id,
      amountCents: transaction.amountCents,
      currency: transaction.currency,
    })
  }

  return [...totals.values()]
    .map((row) => ({
      ...row,
      sourceRecordIds: [...row.sourceRecordIds].sort((a, b) => a.localeCompare(b)),
    }))
    .sort((a, b) => a.sourceType.localeCompare(b.sourceType)
      || a.currency.localeCompare(b.currency)
      || a.categoryName.localeCompare(b.categoryName)
      || a.marginCostClass.localeCompare(b.marginCostClass))
}
