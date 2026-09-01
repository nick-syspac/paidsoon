import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { buildSpendLeakModuleSummaries, isSpendLeakDataStale } from "@/lib/dashboard/spendleakPresentation"
import type { SpendInsight } from "@/lib/generated/prisma/client"

function makeInsight(overrides: Partial<SpendInsight> & { id: string; findingType: string }): SpendInsight {
  return {
    id: overrides.id,
    userId: "user-1",
    accountingConnectionId: null,
    findingType: overrides.findingType,
    subjectKey: `subject-${overrides.id}`,
    severity: "low",
    summary: "summary",
    state: "open",
    estimatedMonthlyCents: null,
    estimatedAnnualCents: null,
    evidence: {},
    detectedAt: new Date("2026-09-01T00:00:00.000Z"),
    resolvedAt: null,
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    updatedAt: new Date("2026-09-01T00:00:00.000Z"),
    ...overrides,
  }
}

describe("SpendLeak presentation", () => {
  test("groups findings by module and derives severity from highest ranked finding", () => {
    const findings = [
      makeInsight({ id: "1", findingType: "duplicate_payment", severity: "high", estimatedAnnualCents: 50000 }),
      makeInsight({ id: "2", findingType: "duplicate_invoice", severity: "low", estimatedAnnualCents: 10000 }),
      makeInsight({ id: "3", findingType: "renewal_alert", severity: "medium", estimatedAnnualCents: 20000 }),
    ]

    const modules = buildSpendLeakModuleSummaries(findings)
    const duplicate = modules.find((module) => module.id === "duplicate_spend")
    const renewals = modules.find((module) => module.id === "renewals")

    assert.ok(duplicate)
    assert.equal(duplicate?.findingCount, 2)
    assert.equal(duplicate?.severity, "red")
    assert.equal(duplicate?.estimatedAnnualCents, 60000)

    assert.ok(renewals)
    assert.equal(renewals?.findingCount, 1)
    assert.equal(renewals?.severity, "yellow")
  })

  test("treats sync as stale only after the 24-hour threshold", () => {
    const now = new Date("2026-09-02T12:00:01.000Z")
    const fresh = new Date("2026-09-01T13:00:01.000Z")
    const stale = new Date("2026-09-01T11:59:59.000Z")

    assert.equal(isSpendLeakDataStale(fresh, now), false)
    assert.equal(isSpendLeakDataStale(stale, now), true)
  })
})
