import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { buildGroundedSummary, detectSpendFindings, normalizeSpendSyncInput } from "@/lib/spendleak/engine"

describe("SpendLeak engine", () => {
  test("normalizes spend sync input and deduplicates repeated rows", () => {
    const normalized = normalizeSpendSyncInput({
      bills: [
        {
          id: "bill-1",
          sourceId: "src-1",
          supplierName: "Acme Cloud",
          amountCents: 120000,
          dueDate: new Date("2026-08-10T00:00:00.000Z"),
        },
        {
          id: "bill-1-dup",
          sourceId: "src-1",
          supplierName: "Acme Cloud",
          amountCents: 130000,
          dueDate: new Date("2026-08-10T00:00:00.000Z"),
        },
      ],
      bankTransactions: [],
      suppliers: [],
    })

    assert.equal(normalized.bills.length, 1)
    assert.equal(normalized.bills[0].amountCents, 120000)
  })

  test("detects recurring spend, duplicate spend, and renewal risk from persisted spend data", () => {
    const now = new Date("2026-09-01T00:00:00.000Z")
    const findings = detectSpendFindings({
      bills: [
        {
          id: "bill-1",
          sourceId: "src-1",
          supplierName: "Acme Cloud",
          amountCents: 120000,
          dueDate: new Date("2026-08-01T00:00:00.000Z"),
          paidDate: new Date("2026-08-02T00:00:00.000Z"),
          status: "paid",
        },
        {
          id: "bill-2",
          sourceId: "src-2",
          supplierName: "Acme Cloud",
          amountCents: 120000,
          dueDate: new Date("2026-07-01T00:00:00.000Z"),
          paidDate: new Date("2026-07-02T00:00:00.000Z"),
          status: "paid",
        },
        {
          id: "bill-3",
          sourceId: "src-3",
          supplierName: "Acme Cloud",
          amountCents: 210000,
          dueDate: new Date("2026-06-01T00:00:00.000Z"),
          paidDate: new Date("2026-06-02T00:00:00.000Z"),
          status: "paid",
        },
        {
          id: "bill-4",
          sourceId: "src-4",
          supplierName: "Northwind Office",
          amountCents: 500000,
          dueDate: new Date("2026-10-15T00:00:00.000Z"),
          status: "open",
        },
        {
          id: "bill-5",
          sourceId: "src-5",
          supplierName: "Northwind Office",
          amountCents: 500000,
          dueDate: new Date("2026-09-15T00:00:00.000Z"),
          status: "open",
        },
      ],
      bankTransactions: [
        { id: "txn-1", amountCents: -400000, description: "Northwind Office", transactionDate: new Date("2026-08-28T00:00:00.000Z") },
        { id: "txn-2", amountCents: -360000, description: "Northwind Office", transactionDate: new Date("2026-08-18T00:00:00.000Z") },
        { id: "txn-3", amountCents: -2100000, description: "Operating cash", transactionDate: new Date("2026-08-21T00:00:00.000Z") },
      ],
      suppliers: [{ id: "supplier-1", supplierName: "Acme Cloud" }, { id: "supplier-2", supplierName: "Northwind Office" }],
      now,
    })

    assert.ok(findings.some((finding) => finding.findingType === "recurring_spend"))
    assert.ok(findings.some((finding) => finding.findingType === "duplicate_spend"))
    assert.ok(findings.some((finding) => finding.findingType === "renewal"))
    assert.ok(findings.some((finding) => finding.findingType === "supplier_concentration"))
    assert.ok(findings.some((finding) => finding.findingType === "cash_pressure"))
  })

  test("detects price increases, duplicate payments, spend trend, and cash runway from deterministic inputs", () => {
    const now = new Date("2026-09-01T00:00:00.000Z")
    const findings = detectSpendFindings({
      bills: [
        {
          id: "bill-a1",
          sourceId: "bill-a1",
          supplierName: "Rising SaaS",
          amountCents: 100000,
          dueDate: new Date("2026-04-01T00:00:00.000Z"),
        },
        {
          id: "bill-a2",
          sourceId: "bill-a2",
          supplierName: "Rising SaaS",
          amountCents: 118000,
          dueDate: new Date("2026-05-01T00:00:00.000Z"),
        },
        {
          id: "bill-a3",
          sourceId: "bill-a3",
          supplierName: "Rising SaaS",
          amountCents: 136000,
          dueDate: new Date("2026-06-01T00:00:00.000Z"),
        },
        {
          id: "bill-a4",
          sourceId: "bill-a4",
          supplierName: "Rising SaaS",
          amountCents: 154000,
          dueDate: new Date("2026-07-01T00:00:00.000Z"),
        },
      ],
      bankTransactions: [
        {
          id: "txn-d1",
          sourceId: "txn-d1",
          description: "Rising SaaS",
          counterpartyName: "Rising SaaS",
          amountCents: -154000,
          transactionDate: new Date("2026-07-03T00:00:00.000Z"),
        },
        {
          id: "txn-d2",
          sourceId: "txn-d2",
          description: "Rising SaaS",
          counterpartyName: "Rising SaaS",
          amountCents: -154000,
          transactionDate: new Date("2026-07-06T00:00:00.000Z"),
        },
      ],
      suppliers: [{ id: "supplier-rs", supplierName: "Rising SaaS" }],
      currentCashCents: 600000,
      openReceivablesCents: 300000,
      now,
    })

    assert.ok(findings.some((finding) => finding.findingType === "price_increase"))
    assert.ok(findings.some((finding) => finding.findingType === "supplier_spend_trend"))
    assert.ok(findings.some((finding) => finding.findingType === "duplicate_payment"))
    assert.ok(findings.some((finding) => finding.findingType === "cash_runway"))
  })

  test("builds grounded summary and safe fallbacks without inventing unsupported claims", () => {
    const summary = buildGroundedSummary({
      findings: [
        {
          findingType: "recurring_spend",
          subjectKey: "Acme Cloud",
          summary: "Acme Cloud has a repeat monthly charge.",
          estimatedAnnualCents: 1200000,
        },
      ],
      syncState: { status: "fresh", latestSyncAt: new Date("2026-08-31T00:00:00.000Z") },
    })

    assert.match(summary, /Acme Cloud/)
    assert.match(summary, /monthly charge|customer/i)
    assert.match(summary, /potential estimates/i)

    const fallback = buildGroundedSummary({
      findings: [],
      syncState: { status: "initial", latestSyncAt: null },
    })

    assert.match(fallback, /no spend findings|initial sync/i)
  })

  test("keeps unsupported categories from becoming fabricated summary claims", () => {
    const summary = buildGroundedSummary({
      findings: [
        {
          findingType: "unmapped_future_detector",
          subjectKey: "subject-1",
          summary: "Future detector output",
          estimatedAnnualCents: 123000,
        },
      ],
      syncState: { status: "fresh", latestSyncAt: new Date("2026-08-31T00:00:00.000Z") },
    })

    assert.match(summary, /supported findings/i)
    assert.doesNotMatch(summary, /unmapped_future_detector/i)
  })
})
