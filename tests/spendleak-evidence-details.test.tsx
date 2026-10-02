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

function makeFinding(evidence: unknown): SpendInsight {
  return {
    id: "finding-1",
    userId: "user-1",
    accountingConnectionId: null,
    findingType: "recurring_spend",
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
    evidence,
    detectedAt: new Date("2026-09-01T00:00:00.000Z"),
    resolvedAt: null,
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    updatedAt: new Date("2026-09-01T00:00:00.000Z"),
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