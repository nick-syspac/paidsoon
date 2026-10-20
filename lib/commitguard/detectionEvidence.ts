import type { CandidateSignal } from "@/lib/commitguard/detectionEngine"

export type DetectionSourceKind = "bill" | "bank_transaction"
export interface EconomicReference {
  kind: "provider_source_id" | "bill_document_number" | "myob_payment_number"
  value: string
}

interface SourceRow {
  accountingConnectionId: string
  sourceId: string
  sourceContactId: string | null
  amountCents: number
  currency: string
  accountingConnection: { provider: string }
}
export interface DetectionBillRow extends SourceRow {
  supplierName: string
  supplierReference: string | null
  documentNumber: string | null
  status: string
  dueDate: Date | null
  paidDate: Date | null
  sourceUpdatedAt: Date | null
  createdAt: Date
}
export interface DetectionBankRow extends SourceRow {
  counterpartyName: string | null
  reference: string | null
  direction: string
  transactionDate: Date
  rawSourceData: unknown
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

export function detectionGroupKey(signal: CandidateSignal): string {
  return JSON.stringify([signal.connectionId, signal.supplierKey, signal.currency])
}

/** Only fields actually persisted by the adapters are used. Free-text references
 * (Xero Reference, MYOB JournalMemo, spreadsheet reference) are not payment links.
 * MYOB PaymentNumber is a banking document identity, not a purchase bill number.
 */
export function buildDetectionSignals(input: {
  bills: readonly DetectionBillRow[]
  bankTransactions: readonly DetectionBankRow[]
}): CandidateSignal[] {
  const signals: CandidateSignal[] = []
  function add(row: SourceRow, name: string, details: {
    sourceKind: DetectionSourceKind
    date: Date
    direction: string
    status: string | null
    reference: string | null
    economicReferences: EconomicReference[]
  }): void {
    const supplierName = name.trim()
    const currency = row.currency.trim().toLowerCase()
    if (!supplierName || !currency || !row.accountingConnectionId || !row.sourceId ||
      !Number.isSafeInteger(row.amountCents) || row.amountCents === 0 ||
      !Number.isFinite(details.date.getTime())) return
    signals.push({
      source: details.sourceKind === "bill" ? "accounting_integration" : "bank_transaction_pattern",
      connectionId: row.accountingConnectionId,
      provider: row.accountingConnection.provider,
      sourceId: row.sourceId,
      observationId: JSON.stringify([row.accountingConnectionId, details.sourceKind, row.sourceId]),
      supplierKey: row.sourceContactId ? `contact:${row.sourceContactId}` : `name:${normalizeText(supplierName)}`,
      supplierName, supplierId: row.sourceContactId,
      category: details.sourceKind === "bill" ? "supplier_agreements" : "other",
      currency, amountCents: Math.abs(row.amountCents), signedAmountCents: row.amountCents,
      ...details,
    })
  }
  for (const bill of input.bills) {
    if (["void", "voided", "cancelled", "canceled", "deleted"].includes(bill.status.trim().toLowerCase())) continue
    const economicReferences: EconomicReference[] = [{ kind: "provider_source_id", value: bill.sourceId }]
    if (["xero", "myob"].includes(bill.accountingConnection.provider) && bill.documentNumber?.trim()) {
      economicReferences.push({ kind: "bill_document_number", value: bill.documentNumber.trim() })
    }
    add(bill, bill.supplierName, { sourceKind: "bill",
      date: bill.dueDate ?? bill.paidDate ?? bill.sourceUpdatedAt ?? bill.createdAt,
      direction: "outflow", status: bill.status, reference: bill.supplierReference, economicReferences })
  }
  for (const bank of input.bankTransactions) {
    // Never infer direction from sign: Xero persists positive SPEND totals,
    // MYOB persists negative spend, CSV can persist negative unknown-direction rows.
    if (bank.direction !== "outflow") continue
    const economicReferences: EconomicReference[] = [{ kind: "provider_source_id", value: bank.sourceId }]
    const raw = bank.rawSourceData
    if (bank.accountingConnection.provider === "myob" && typeof raw === "object" && raw !== null &&
      "PaymentNumber" in raw && typeof raw.PaymentNumber === "string" && raw.PaymentNumber.trim()) {
      economicReferences.push({ kind: "myob_payment_number", value: raw.PaymentNumber.trim() })
    }
    add(bank, bank.counterpartyName ?? "", { sourceKind: "bank_transaction", date: bank.transactionDate,
      direction: bank.direction, status: null, reference: bank.reference, economicReferences })
  }
  return signals
}

export interface DetectionEvidenceStream {
  groupKey: string
  sourceKind: DetectionSourceKind
  signals: CandidateSignal[]
  excludedObservations: CandidateSignal[]
  warnings: string[]
}

/** Exact source/economic identities are scoped to a connection, supplier,
 * currency and source kind. Similar date/amount rows are NOT merged: all members
 * of an unproven duplicate cluster are withheld and retained for review.
 */
export function buildDetectionEvidenceStreams(signals: readonly CandidateSignal[]): DetectionEvidenceStream[] {
  const streams = new Map<string, DetectionEvidenceStream>()
  for (const signal of signals) {
    const groupKey = detectionGroupKey(signal)
    const key = JSON.stringify([groupKey, signal.sourceKind])
    const stream = streams.get(key) ?? { groupKey, sourceKind: signal.sourceKind,
      signals: [], excludedObservations: [], warnings: [] }
    stream.signals.push(signal)
    streams.set(key, stream)
  }
  for (const stream of streams.values()) {
    const rows = [...stream.signals].sort((a, b) => a.observationId.localeCompare(b.observationId) ||
      a.date.getTime() - b.date.getTime() || a.amountCents - b.amountCents)
    // Connected components handle transitive duplicate references without depending
    // on input order (a source retry may also share a document number with another row).
    const components: CandidateSignal[][] = []
    for (const row of rows) {
      const matches = components.filter((items) => items.some((other) =>
        row.economicReferences.some((ref) => other.economicReferences.some((candidate) =>
          ref.kind === candidate.kind && ref.value === candidate.value))))
      const merged = [...matches.flat(), row]
      for (const match of matches) components.splice(components.indexOf(match), 1)
      components.push(merged)
    }
    const distinct: CandidateSignal[] = []
    for (const component of components) {
      const first = component[0]
      if (component.some((row) => row.date.getTime() !== first.date.getTime() || row.amountCents !== first.amountCents)) {
        stream.excludedObservations.push(...component)
        stream.warnings.push("conflicting_economic_reference")
      } else {
        distinct.push(first)
        stream.excludedObservations.push(...component.slice(1))
        if (component.length > 1) stream.warnings.push("duplicate_economic_reference")
      }
    }
    const possibleDuplicates = new Map<string, CandidateSignal[]>()
    for (const row of distinct) {
      const key = JSON.stringify([row.date.toISOString().slice(0, 10), row.amountCents])
      const group = possibleDuplicates.get(key) ?? []
      group.push(row)
      possibleDuplicates.set(key, group)
    }
    stream.signals = []
    for (const group of possibleDuplicates.values()) {
      if (group.length === 1) stream.signals.push(group[0])
      else {
        stream.excludedObservations.push(...group)
        stream.warnings.push("ambiguous_potential_duplicates")
      }
    }
    stream.warnings = [...new Set(stream.warnings)].sort()
  }
  return [...streams.values()].sort((a, b) => a.groupKey.localeCompare(b.groupKey) || a.sourceKind.localeCompare(b.sourceKind))
}