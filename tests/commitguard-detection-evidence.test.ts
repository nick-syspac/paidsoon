import assert from "node:assert/strict"
import { test } from "node:test"
import { buildDetectionSignals, type DetectionBillRow, type DetectionBankRow } from "@/lib/commitguard/detectionEvidence"
import { inferScopedCommitmentCandidates } from "@/lib/commitguard/detectionEngine"
import { getSpendImportDirection } from "@/lib/spendImport/mapping"

const policy = { amountVariancePercent: 12, intervalToleranceDays: 3, confidenceThreshold: "low" as const }
function bill(index: number, patch: Partial<DetectionBillRow> = {}): DetectionBillRow {
  return { accountingConnectionId: "connection-a", accountingConnection: { provider: "xero" },
    sourceId: `bill-${index}`, sourceContactId: "supplier-a", supplierName: "Synthetic",
    supplierReference: null, documentNumber: `BILL-${index}`, status: "paid", amountCents: 1000,
    currency: "AUD", dueDate: new Date(Date.UTC(2026, 0, 1 + index * 7)),
    paidDate: null, sourceUpdatedAt: null, createdAt: new Date("2026-01-01"), ...patch }
}
function bank(index: number, patch: Partial<DetectionBankRow> = {}): DetectionBankRow {
  return { accountingConnectionId: "connection-a", accountingConnection: { provider: "xero" },
    sourceId: `bank-${index}`, sourceContactId: "supplier-a", counterpartyName: "Synthetic",
    reference: null, direction: "outflow", amountCents: 1000, currency: "AUD",
    transactionDate: new Date(Date.UTC(2026, 0, 1 + index * 7)), rawSourceData: {}, ...patch }
}
function analyze(bills: DetectionBillRow[], bankTransactions: DetectionBankRow[], minOccurrences?: number) {
  return inferScopedCommitmentCandidates({ ...policy, minOccurrences,
    signals: buildDetectionSignals({ bills, bankTransactions }) })
}
const rows = <T>(count: number, factory: (index: number) => T): T[] => Array.from({ length: count }, (_, index) => factory(index))

test("5.2 provider direction is authoritative for positive Xero and negative MYOB outflows", () => {
  const signals = buildDetectionSignals({ bills: [], bankTransactions: [bank(0), bank(1, {
    accountingConnection: { provider: "myob" }, sourceId: "spend:uid", amountCents: -1000,
    rawSourceData: { UID: "uid", PaymentNumber: "PAY-1" },
  }), bank(2, { direction: "inflow", amountCents: -1000 }), bank(3, { direction: "unknown", amountCents: -1000 }),
  bank(4, { amountCents: 0 }), bank(5, { direction: "inflow", amountCents: 1000 })] })
  assert.equal(signals.length, 2)
  assert.deepEqual(signals.map((row) => row.signedAmountCents), [1000, -1000])
  assert.deepEqual(signals.map((row) => row.amountCents), [1000, 1000])
  assert.deepEqual(signals[1].economicReferences, [
    { kind: "provider_source_id", value: "spend:uid" }, { kind: "myob_payment_number", value: "PAY-1" },
  ])
  // The spreadsheet writer stores -abs(amount) even when original direction was unknown.
  assert.equal(analyze([], rows(3, (index) => bank(index, { accountingConnection: { provider: "csv_import" },
    amountCents: -1000, direction: getSpendImportDirection("transaction", 10) }))).candidates.length, 0)
})

test("5.2 void/cancel/delete and zero bills are excluded case-insensitively", () => {
  for (const status of ["void", "VOIDED", " Cancelled ", "canceled", "deleted"]) {
    assert.equal(analyze(rows(3, (index) => bill(index, { status })), []).candidates.length, 0)
  }
  assert.equal(analyze(rows(3, (index) => bill(index, { amountCents: 0 })), []).candidates.length, 0)
  assert.equal(analyze(rows(3, (index) => bill(index, { status: "open" })), []).candidates.length, 1)
})

for (let minimum = 2; minimum <= 10; minimum += 1) {
  test(`5.2 scoped engine cannot concatenate streams or connections at minimum ${minimum}`, () => {
    const bills = rows(minimum - 1, (index) => bill(index))
    assert.equal(analyze(bills, [bank(minimum - 1)], minimum).candidates.length, 0)
    const separateConnection = bill(minimum - 1, { accountingConnectionId: "connection-b" })
    assert.equal(analyze([...bills, separateConnection], [], minimum).candidates.length, 0)
    assert.equal(analyze([...bills, bill(minimum - 1, { currency: "USD" })], [], minimum).candidates.length, 0)
    assert.equal(analyze([...bills, bill(minimum - 1)], [], minimum).candidates[0]?.evidence.sampleCount, minimum)
  })
}

test("5.2 scoped default minimum is three and source identities are stable across input order", () => {
  assert.equal(analyze([bill(0), bill(1)], []).candidates.length, 0)
  const input = rows(3, (index) => bill(index))
  const first = analyze(input, []).candidates[0]
  assert.deepEqual(analyze([...input].reverse(), []).candidates[0], first)
  assert.equal(first.evidence.connectionId, "connection-a")
  assert.deepEqual(first.evidence.observations.map((row) => row.sourceId), ["bill-0", "bill-1", "bill-2"])
  assert.equal(new Set(first.evidence.observations.map((row) => row.observationId)).size, 3)
  assert.deepEqual(first.evidence.observations[0], {
    observationId: JSON.stringify(["connection-a", "bill", "bill-0"]), connectionId: "connection-a",
    provider: "xero", sourceKind: "bill", sourceId: "bill-0", date: "2026-01-01T00:00:00.000Z",
    amountCents: 1000, signedAmountCents: 1000, currency: "aud", direction: "outflow", status: "paid", reference: null,
    economicReferences: [{ kind: "provider_source_id", value: "bill-0" }, { kind: "bill_document_number", value: "BILL-0" }],
  })
})

test("5.2 source retry and exact provider document references never add observations", () => {
  const bills = [bill(0), bill(1)]
  assert.equal(analyze([...bills, bill(1)], []).candidates.length, 0)
  assert.equal(analyze([...bills, bill(1, { sourceId: "another-row" })], []).candidates.length, 0)
  const result = analyze([...bills, bill(2), bill(1, { sourceId: "another-row" })], [])
  assert.equal(result.candidates[0].evidence.sampleCount, 3)
  assert.equal(result.candidates[0].evidence.excludedObservations.length, 1)
  assert.deepEqual(result.warnings, ["duplicate_economic_reference"])
  const banks = rows(3, (index) => bank(index, { accountingConnection: { provider: "myob" },
    rawSourceData: { PaymentNumber: "same-payment" } }))
  assert.equal(analyze([], banks).candidates.length, 0)
  assert.deepEqual(analyze([], banks).warnings, ["conflicting_economic_reference"])
})

test("5.2 ambiguous same-day same-amount rows are withheld, not guessed to be distinct or duplicates", () => {
  const ambiguous = bill(1, { sourceId: "unrelated-id", documentNumber: "unrelated-document" })
  const result = analyze([bill(0), bill(1), bill(2), bill(3), ambiguous], [])
  assert.equal(result.candidates[0].evidence.sampleCount, 3)
  assert.equal(result.candidates[0].evidence.excludedObservations.length, 2)
  assert.deepEqual(result.warnings, ["ambiguous_potential_duplicates"])
  assert.equal(analyze([bill(0), bill(1), ambiguous], []).candidates.length, 0)
})

test("5.2 qualifying bill stream wins, bank evidence is informational and warning remains", () => {
  const result = analyze(rows(3, (index) => bill(index)), rows(6, (index) => bank(index)))
  assert.equal(result.candidates.length, 1)
  const evidence = result.candidates[0].evidence
  assert.equal(evidence.sourceKind, "bill")
  assert.equal(evidence.sampleCount, 3)
  assert.equal(evidence.alternateStreams[0].sampleCount, 6)
  assert.equal(evidence.alternateStreams[0].qualifying, true)
  assert.deepEqual(evidence.warnings, ["potential_duplicate_streams"])
  assert.deepEqual(analyze([bill(0)], [bank(1)]).warnings, ["potential_duplicate_streams"])
})

test("5.2 preference requires same connection supplier currency AND frequency", () => {
  const weekly = rows(3, (index) => bill(index))
  const monthly = rows(3, (index) => bank(index, { transactionDate: new Date(Date.UTC(2026, index, 1)) }))
  assert.deepEqual(analyze(weekly, monthly).candidates.map((item) => item.frequency).sort(), ["monthly", "weekly"])
  for (const patch of [{ accountingConnectionId: "connection-b" }, { currency: "USD" }, { sourceContactId: "supplier-b" }]) {
    const result = analyze(weekly, rows(3, (index) => bank(index, patch)))
    assert.equal(result.candidates.length, 2)
    assert.ok(result.candidates.every((item) => item.evidence.alternateStreams.length === 0))
  }
})

test("5.2 bank stream can qualify alone but never borrows an under-threshold bill", () => {
  const result = analyze([bill(0)], rows(3, (index) => bank(index)))
  assert.equal(result.candidates[0].evidence.sourceKind, "bank_transaction")
  assert.equal(result.candidates[0].evidence.sampleCount, 3)
  assert.equal(result.candidates[0].evidence.alternateStreams[0].sampleCount, 1)
})

test("5.2 generic references are not economic links or transaction IDs", () => {
  const result = analyze(rows(3, (index) => bill(index, { supplierReference: "Monthly charge" })),
    rows(3, (index) => bank(index, { reference: "Monthly charge", rawSourceData: { InvoiceID: "invented-link" } })))
  assert.equal(result.candidates[0].evidence.sampleCount, 3)
  assert.equal(result.candidates[0].evidence.alternateStreams[0].sampleCount, 3)
  const csv = analyze(rows(3, (index) => bill(index, { accountingConnection: { provider: "csv_import" },
    documentNumber: "Free text", supplierReference: "Free text" })), [])
  assert.equal(csv.candidates[0].evidence.sampleCount, 3)
  assert.deepEqual(csv.warnings, [])
})