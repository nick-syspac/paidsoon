import assert from "node:assert/strict"
import { describe, test } from "node:test"
import {
  buildSpendLeakDashboardStatus,
  buildSpendLeakEvidenceView,
  buildSpendLeakModuleSummaries,
  isSpendLeakDataStale,
} from "@/lib/dashboard/spendleakPresentation"
import type { SpendInsight } from "@/lib/generated/prisma/client"

function makeInsight(overrides: Partial<SpendInsight> & { id: string; findingType: string }): SpendInsight {
  const { id, findingType, ...rest } = overrides
  return {
    id,
    userId: "user-1",
    accountingConnectionId: null,
    findingType,
    subjectKey: `subject-${id}`,
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
    ...rest,
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

  test("classifies dashboard sync states explicitly", () => {
    const now = new Date("2026-09-02T12:00:00.000Z")

    const initial = buildSpendLeakDashboardStatus({
      findingsCount: 0,
      hasAccountingConnection: true,
      latestSyncAt: null,
      sourceSyncCount: 0,
      now,
    })

    const partial = buildSpendLeakDashboardStatus({
      findingsCount: 2,
      hasAccountingConnection: true,
      latestSyncAt: new Date("2026-09-02T00:00:00.000Z"),
      sourceSyncCount: 1,
      now,
    })

    const empty = buildSpendLeakDashboardStatus({
      findingsCount: 0,
      hasAccountingConnection: true,
      latestSyncAt: new Date("2026-09-02T00:00:00.000Z"),
      sourceSyncCount: 3,
      now,
    })

    assert.equal(initial.state, "initial_sync")
    assert.equal(partial.state, "partial_data")
    assert.equal(empty.state, "empty")
  })

  test("renders duplicate spend evidence into readable sections", () => {
    const view = buildSpendLeakEvidenceView(
      makeInsight({
        id: "4",
        findingType: "duplicate_payment",
        reviewAction: "cancel",
        reviewActionAt: new Date("2026-09-03T00:00:00.000Z"),
        reviewNote: "Duplicate confirmed",
        evidence: {
          supplier: "metro saas systems",
          source: "expense_import",
          billIds: ["coast-bill-metro-jan", "coast-bill-metro-feb"],
          dayDifference: 30,
          amountCents: 420000,
        },
        estimatedMonthlyCents: 420000,
        estimatedAnnualCents: 5040000,
      }),
    )

    const duplicateSection = view.sections.find((section) => section.title === "Duplicate comparison")

    assert.ok(duplicateSection)
    assert.equal(duplicateSection?.fields.find((field) => field.label === "Bill references")?.value, "coast-bill-metro-jan · coast-bill-metro-feb")
    assert.equal(duplicateSection?.fields.find((field) => field.label === "Amount")?.value, "$4,200")
    assert.equal(view.sourceSummary.find((field) => field.label === "Evidence source")?.value, "Expense import")
    assert.equal(view.sourceSummary.find((field) => field.label === "Review outcome")?.value, "Cancel")
    assert.equal(view.sourceSummary.find((field) => field.label === "Estimated annual impact")?.value, "$50,400")
  })
})
