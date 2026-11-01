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
    userId: overrides.userId ?? "user-1",
    accountingConnectionId: overrides.accountingConnectionId ?? null,
    findingType: overrides.findingType,
    subjectKey: overrides.subjectKey ?? "subject",
    severity: overrides.severity ?? "medium",
    summary: overrides.summary ?? "summary",
    state: overrides.state ?? "open",
    reviewAction: overrides.reviewAction ?? null,
    reviewActionAt: overrides.reviewActionAt ?? null,
    reviewActionBy: overrides.reviewActionBy ?? null,
    reviewNote: overrides.reviewNote ?? null,
    evidenceFingerprint: overrides.evidenceFingerprint ?? null,
    estimatedMonthlyCents: overrides.estimatedMonthlyCents ?? 1000,
    estimatedAnnualCents: overrides.estimatedAnnualCents ?? 12000,
    accountDisplayRevision: overrides.accountDisplayRevision ?? 0,
    accountDisplayFromDate: overrides.accountDisplayFromDate ?? null,
    accountDisplayTimeZone: overrides.accountDisplayTimeZone ?? null,
    evidence: overrides.evidence ?? { supplier: "Acme" },
    detectedAt: overrides.detectedAt ?? new Date("2026-09-01T00:00:00.000Z"),
    resolvedAt: overrides.resolvedAt ?? null,
    createdAt: overrides.createdAt ?? new Date("2026-09-01T00:00:00.000Z"),
    updatedAt: overrides.updatedAt ?? new Date("2026-09-01T00:00:00.000Z"),
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

  test("excludes findings whose evidence predates the active cutoff", () => {
    const cutoff = new Date("2026-09-10T00:00:00.000Z")
    const findings = [
      makeFinding({
        id: "1",
        findingType: "recurring_spend",
        accountDisplayRevision: 2,
        accountDisplayFromDate: cutoff,
        accountDisplayTimeZone: "Australia/Melbourne",
        evidence: {
          supplier: "Acme",
          firstObservedDate: "2026-09-05T00:00:00.000Z",
          latestObservedDate: "2026-09-06T00:00:00.000Z",
        },
      }),
      makeFinding({
        id: "2",
        findingType: "duplicate_spend",
        accountDisplayRevision: 2,
        accountDisplayFromDate: cutoff,
        accountDisplayTimeZone: "Australia/Melbourne",
        evidence: {
          supplier: "Acme",
          recentCharges: [{ observedDate: "2026-09-12T00:00:00.000Z" }],
        },
      }),
      makeFinding({
        id: "3",
        findingType: "renewal",
        accountDisplayRevision: 2,
        accountDisplayFromDate: cutoff,
        accountDisplayTimeZone: "Australia/Melbourne",
        evidence: {
          supplier: "Acme",
          recentTransactions: [{ transactionDate: "2026-09-09T00:00:00.000Z" }],
        },
      }),
    ]

    const result = applySpendLeakExportFilters(findings, {
      module: null,
      cutoffDate: cutoff,
      accountDisplayPolicy: {
        accountDisplayRevision: 2,
        accountDisplayFromDate: cutoff,
        accountDisplayTimeZone: "Australia/Melbourne",
      },
    })
    assert.deepEqual(result.map((finding) => finding.id), ["2"])
  })

  test("rejects stale findings whose provenance no longer matches the active policy", () => {
    const findings = [
      makeFinding({
        id: "legacy",
        findingType: "recurring_spend",
        accountDisplayRevision: 1,
        accountDisplayFromDate: new Date("2026-09-01T00:00:00.000Z"),
        accountDisplayTimeZone: "Australia/Melbourne",
        evidence: { supplier: "Acme", firstObservedDate: "2026-09-12T00:00:00.000Z" },
      }),
      makeFinding({
        id: "current",
        findingType: "duplicate_spend",
        accountDisplayRevision: 2,
        accountDisplayFromDate: new Date("2026-09-10T00:00:00.000Z"),
        accountDisplayTimeZone: "Australia/Melbourne",
        evidence: { supplier: "Acme", recentCharges: [{ observedDate: "2026-09-12T00:00:00.000Z" }] },
      }),
    ]

    const result = applySpendLeakExportFilters(findings, {
      module: null,
      cutoffDate: new Date("2026-09-10T00:00:00.000Z"),
      accountDisplayPolicy: {
        accountDisplayRevision: 2,
        accountDisplayFromDate: new Date("2026-09-10T00:00:00.000Z"),
        accountDisplayTimeZone: "Australia/Melbourne",
      },
    })

    assert.deepEqual(result.map((finding) => finding.id), ["current"])
  })
})
