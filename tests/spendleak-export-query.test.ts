import { describe, test } from "node:test"
import assert from "node:assert/strict"

import {
  applySpendLeakExportFilters,
  parseSpendLeakExportModule,
} from "@/lib/spendleak/exportQuery"
import type { SpendInsight } from "@/lib/generated/prisma/client"

function makeFinding(overrides: Partial<SpendInsight> & { id: string; findingType: string }): SpendInsight {
  return {
    id: overrides.id,
    userId: "user-1",
    accountingConnectionId: null,
    findingType: overrides.findingType,
    subjectKey: "subject",
    severity: "medium",
    summary: "summary",
    state: "open",
    reviewAction: null,
    reviewActionAt: null,
    reviewActionBy: null,
    reviewNote: null,
    evidenceFingerprint: null,
    estimatedMonthlyCents: 1000,
    estimatedAnnualCents: 12000,
    evidence: { supplier: "Acme" },
    detectedAt: new Date("2026-09-01T00:00:00.000Z"),
    resolvedAt: null,
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    updatedAt: new Date("2026-09-01T00:00:00.000Z"),
    ...overrides,
  }
}

describe("parseSpendLeakExportModule", () => {
  test("returns null for missing module", () => {
    assert.equal(parseSpendLeakExportModule(undefined), null)
    assert.equal(parseSpendLeakExportModule(null), null)
  })

  test("accepts known modules only", () => {
    assert.equal(parseSpendLeakExportModule("recurring_spend"), "recurring_spend")
    assert.equal(parseSpendLeakExportModule("unknown"), null)
  })
})

describe("applySpendLeakExportFilters", () => {
  test("returns all findings when no module filter is set", () => {
    const findings = [
      makeFinding({ id: "1", findingType: "recurring_spend" }),
      makeFinding({ id: "2", findingType: "renewal" }),
    ]

    const result = applySpendLeakExportFilters(findings, { module: null })
    assert.deepEqual(result.map((finding) => finding.id), ["1", "2"])
  })

  test("filters findings by mapped module", () => {
    const findings = [
      makeFinding({ id: "1", findingType: "recurring_spend" }),
      makeFinding({ id: "2", findingType: "duplicate_spend" }),
      makeFinding({ id: "3", findingType: "renewal" }),
    ]

    const result = applySpendLeakExportFilters(findings, { module: "duplicate_spend" })
    assert.deepEqual(result.map((finding) => finding.id), ["2"])
  })
})
