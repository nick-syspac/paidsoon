import assert from "node:assert/strict"
import { describe, test } from "node:test"

import {
  buildOwnersDigestSummary,
  computeOwnersDigestPriorityScore,
  dedupeOwnersDigestSignals,
  determineOwnersDigestStatus,
  getOwnersDigestPeriodBounds,
  shouldSurfaceOwnersDigestSignal,
} from "@/lib/ownersDigest/logic"
import type { OwnersDigestSignal } from "@/lib/ownersDigest/types"

const DEFAULT_SETTINGS = {
  enabled: true,
  emailEnabled: false,
  frequency: "weekly",
  deliveryDay: "monday",
  deliveryTime: "07:00",
  timezone: "Australia/Sydney",
  includeNeedsAttention: true,
  includeOpportunities: true,
  includePositiveChanges: true,
  includeKeyNumbers: true,
  maxActionItems: 5,
  minimumMaterialityCents: 10_000,
  sendWhenEmpty: true,
  recipientScope: "owner_only",
} as const

function makeSignal(overrides: Partial<OwnersDigestSignal> = {}): OwnersDigestSignal {
  return {
    id: overrides.id ?? "signal-1",
    source: overrides.source ?? "paidsoon",
    signalType: overrides.signalType ?? "OVERDUE_30_PLUS",
    title: overrides.title ?? "Overdue invoices increased",
    summary: overrides.summary ?? "Overdue invoices increased materially.",
    severity: overrides.severity ?? "warning",
    recommendedAction: overrides.recommendedAction ?? "Review invoices",
    actionUrl: overrides.actionUrl ?? "/dashboard/invoices",
    whyItMatters: overrides.whyItMatters ?? "Cash collection slowed.",
    financialImpactCents: overrides.financialImpactCents ?? 20_000,
    currentValue: overrides.currentValue ?? 20_000,
    previousValue: overrides.previousValue ?? 10_000,
    changeValue: overrides.changeValue ?? 10_000,
    changePercent: overrides.changePercent === undefined ? 100 : overrides.changePercent,
    entityType: overrides.entityType ?? "invoice",
    entityId: overrides.entityId ?? "invoice-1",
    entityName: overrides.entityName ?? "Invoice 1",
    detectedAt: overrides.detectedAt ?? new Date("2026-01-12T07:00:00.000Z"),
    correlationKey: overrides.correlationKey ?? null,
    metadata: overrides.metadata ?? undefined,
  }
}

describe("Owner's Digest logic", () => {
  test("weekly period starts on Monday in UTC", () => {
    const bounds = getOwnersDigestPeriodBounds("weekly", new Date("2026-01-14T10:00:00.000Z"))

    assert.equal(bounds.frequency, "weekly")
    assert.equal(bounds.periodStart.toISOString(), "2026-01-12T00:00:00.000Z")
    assert.equal(bounds.periodEnd.toISOString(), "2026-01-18T23:59:59.999Z")
  })

  test("critical signal outranks lower-severity signals", () => {
    const warningScore = computeOwnersDigestPriorityScore(makeSignal({ severity: "warning", financialImpactCents: 15_000 }))
    const criticalScore = computeOwnersDigestPriorityScore(makeSignal({ severity: "critical", financialImpactCents: 5_000 }))

    assert.ok(criticalScore > warningScore)
  })

  test("materiality filter suppresses low-impact non-critical items", () => {
    const visible = shouldSurfaceOwnersDigestSignal(
      makeSignal({ financialImpactCents: 20_000 }),
      DEFAULT_SETTINGS,
    )
    const hidden = shouldSurfaceOwnersDigestSignal(
      makeSignal({ severity: "positive", financialImpactCents: 100, changePercent: null }),
      DEFAULT_SETTINGS,
    )

    assert.equal(visible, true)
    assert.equal(hidden, false)
  })

  test("correlated cash-pressure signals merge into one item", () => {
    const items = dedupeOwnersDigestSignals([
      makeSignal({ id: "cashplan", source: "cashplan", correlationKey: "cash_pressure", title: "Cash buffer risk" }),
      makeSignal({ id: "runway", source: "runwayguard", correlationKey: "cash_pressure", title: "Runway risk", severity: "critical" }),
    ])

    assert.equal(items.length, 1)
    assert.deepEqual(items[0].contributingSources.sort(), ["cashplan", "runwayguard"])
    assert.equal(items[0].severity, "critical")
  })

  test("status and summary reflect the highest-severity items", () => {
    const items = dedupeOwnersDigestSignals([
      makeSignal({ id: "1", severity: "critical", correlationKey: "a" }),
      makeSignal({ id: "2", severity: "opportunity", correlationKey: "b", financialImpactCents: 5_000 }),
      makeSignal({ id: "3", severity: "positive", correlationKey: "c", financialImpactCents: 3_000 }),
    ])

    const status = determineOwnersDigestStatus(items)
    const summary = buildOwnersDigestSummary(status, items)

    assert.equal(status, "critical")
    assert.match(summary, /Immediate financial attention is required/)
    assert.match(summary, /1 item needs attention/)
  })
})
