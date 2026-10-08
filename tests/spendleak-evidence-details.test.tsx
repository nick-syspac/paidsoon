import assert from "node:assert/strict"
import { describe, test } from "node:test"
import type { ReactElement } from "react"

import { SpendLeakEvidenceDetails } from "@/components/dashboard/spendleak/SpendLeakEvidenceDetails"
import type { SpendInsight } from "@/lib/generated/prisma/client"

function collectText(node: unknown): string {
  if (typeof node === "string") return node
  if (typeof node === "number") return String(node)
  if (!node || typeof node !== "object") return ""

  const element = node as { props?: { children?: unknown } }
  const children = element.props?.children

  if (Array.isArray(children)) {
    return children.map((child) => collectText(child)).join(" ")
  }

  if (children !== undefined) {
    return collectText(children)
  }

  return ""
}

function makeFinding(input: unknown): SpendInsight {
  const overrides = input && typeof input === "object" && !Array.isArray(input) && "evidence" in input
    ? (input as Partial<SpendInsight> & { evidence: unknown })
    : { evidence: input }

  return {
    id: overrides.id ?? "finding-1",
    userId: "user-1",
    accountingConnectionId: null,
    findingType: overrides.findingType ?? "recurring_spend",
    subjectKey: "Acme Cloud",
    severity: "medium",
    summary: "Acme Cloud shows a repeat monthly spend pattern.",
    state: "open",
    reviewAction: null,
    reviewActionAt: null,
    reviewActionBy: null,
    reviewNote: null,
    evidenceFingerprint: null,
    estimatedMonthlyCents: 120000,
    estimatedAnnualCents: 1440000,
    evidence: overrides.evidence,
    detectedAt: new Date("2026-09-01T00:00:00.000Z"),
    resolvedAt: null,
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    updatedAt: new Date("2026-09-01T00:00:00.000Z"),
    ...overrides,
  }
}

describe("SpendLeakEvidenceDetails", () => {
  test("renders recurring charge rows with accounting references", () => {
    const element = SpendLeakEvidenceDetails({
      finding: makeFinding({
        supplier: "Acme Cloud",
        source: "myob",
        billCount: 3,
        averageAmountCents: 120000,
        cadenceLabel: "monthly",
        averageIntervalDays: 30,
        firstObservedDate: "2026-06-01T00:00:00.000Z",
        latestObservedDate: "2026-08-01T00:00:00.000Z",
        recentCharges: [
          {
            sourceId: "bill-aug",
            documentNumber: "BILL-1003",
            supplierReference: "August cloud",
            amountCents: 120000,
            observedDate: "2026-08-01T00:00:00.000Z",
          },
        ],
      }),
    }) as ReactElement

    const text = collectText(element)
    assert.match(text, /Recurring pattern/)
    assert.match(text, /Observed cadence/)
    assert.match(text, /monthly/)
    assert.match(text, /Recent recurring charges/)
    assert.match(text, /BILL-1003/)
    assert.match(text, /August cloud/)
  })

  test("renders shared drillback rows for non-recurring findings", () => {
    const element = SpendLeakEvidenceDetails({
      finding: makeFinding({
        findingType: "duplicate_spend",
        summary: "Possible duplicate spend for metro saas systems appears within a short time window.",
        evidence: {
          supplier: "metro saas systems",
          source: "expense_import",
          billIds: ["coast-bill-metro-jan", "coast-bill-metro-feb"],
          dayDifference: 30,
          amountCents: 420000,
          recentCharges: [
            {
              sourceId: "dup-jan",
              documentNumber: "BILL-2001",
              supplierReference: "January metro",
              amountCents: 420000,
              observedDate: "2026-08-01T00:00:00.000Z",
            },
          ],
        },
      }),
    }) as ReactElement

    const text = collectText(element)
    assert.match(text, /Duplicate comparison/)
    assert.match(text, /Supporting records/)
    assert.match(text, /BILL-2001/)
    assert.match(text, /January metro/)
  })

  test("renders both matched duplicate-payment transactions with source references", () => {
    const element = SpendLeakEvidenceDetails({
      finding: makeFinding({
        findingType: "duplicate_payment",
        summary: "Possible duplicate payment detected for Acme Cloud within a short timeframe.",
        evidence: {
          counterparty: "Acme Cloud",
          transactionIds: ["txn-first", "txn-second"],
          amountCents: 120000,
          dayDifference: 6,
          recentTransactions: [
            {
              sourceId: "txn-first",
              description: "Cloud hosting payment",
              counterpartyName: "Acme Cloud",
              amountCents: 120000,
              transactionDate: "2026-08-01T00:00:00.000Z",
            },
            {
              sourceId: "txn-second",
              description: "Acme Cloud payment",
              counterpartyName: "Acme Cloud",
              amountCents: 120000,
              transactionDate: "2026-08-07T00:00:00.000Z",
            },
          ],
        },
      }),
    }) as ReactElement

    const text = collectText(element)
    assert.match(text, /Counterparty/)
    assert.match(text, /Acme Cloud/)
    assert.match(text, /Matched transactions/)
    assert.match(text, /Cloud hosting payment/)
    assert.match(text, /Acme Cloud payment/)
    assert.match(text, /txn-first/)
    assert.match(text, /txn-second/)
  })

  test("renders bank transaction drillback rows for cash pressure", () => {
    const element = SpendLeakEvidenceDetails({
      finding: makeFinding({
        findingType: "cash_pressure",
        summary: "Cash pressure is elevated.",
        evidence: {
          negativeBankTransactionCents: 2100000,
          spendCents: 4500000,
          transactionCount: 3,
          recentTransactions: [
            {
              sourceId: "txn-1",
              description: "Operating cash",
              counterpartyName: "Bank account",
              amountCents: 2100000,
              transactionDate: "2026-08-21T00:00:00.000Z",
            },
          ],
        },
      }),
    }) as ReactElement

    const text = collectText(element)
    assert.match(text, /Cash pressure snapshot/)
    assert.match(text, /Recent bank transactions/)
    assert.match(text, /Operating cash/)
    assert.match(text, /Bank account/)
  })

  test("renders explicit fallback labels for partial recurring evidence", () => {
    const element = SpendLeakEvidenceDetails({
      finding: makeFinding({
        supplier: "Acme Cloud",
        source: "myob",
        billCount: 1,
        averageAmountCents: 120000,
        recentCharges: [
          {
            sourceId: null,
            documentNumber: null,
            supplierReference: null,
            amountCents: 120000,
            observedDate: null,
          },
        ],
      }),
    }) as ReactElement

    const text = collectText(element)
    assert.match(text, /Not available/)
  })
})