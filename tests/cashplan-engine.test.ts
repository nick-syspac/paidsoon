import assert from "node:assert/strict"
import { describe, test } from "node:test"

import {
  buildCashPlanForecast,
  buildCashPlanSnapshotPayload,
  buildCashPlanSourceLineage,
  buildCashPlanOverrideAudit,
  buildCashPlanOverviewSummary,
  buildCashPlanPlanWorkspace,
  buildCashPlanScenario,
  buildCashPlanScenarioComparison,
  buildCashPlanRecommendations,
  buildCashPlanAlert,
  buildCashPlanDigest,
  buildCashPlanSummaryResponse,
  defaultCashPlanSettings,
  evaluateCashPlanRecalculationTriggers,
} from "@/lib/cashplan/engine"

describe("CashPlan forecast engine", () => {
  test("builds a deterministic 13-week forecast and tracks version/hash metadata", () => {
    const first = buildCashPlanForecast({
      openingCashCents: 1_200_000,
      inflows: [
        { id: "invoice-1", kind: "inflow", amountCents: 220_000, weekIndex: 1 },
        { id: "invoice-2", kind: "inflow", amountCents: 180_000, weekIndex: 3 },
      ],
      outflows: [
        { id: "bill-1", kind: "outflow", amountCents: 90_000, weekIndex: 0 },
        { id: "bill-2", kind: "outflow", amountCents: 125_000, weekIndex: 2 },
      ],
      bufferTargetCents: 150_000,
      now: new Date("2026-09-07T00:00:00.000Z"),
    })

    assert.equal(first.weeks.length, 13)
    assert.equal(first.engineVersion, "cashplan-v1")
    assert.ok(first.inputHash.length > 0)
    assert.ok(first.lowestClosingCashCents <= first.weeks[0].closingCashCents)
    assert.ok(first.dataQualityIssues.length >= 0)

    const second = buildCashPlanForecast({
      openingCashCents: 1_200_000,
      inflows: [
        { id: "invoice-1", kind: "inflow", amountCents: 220_000, weekIndex: 1 },
        { id: "invoice-2", kind: "inflow", amountCents: 180_000, weekIndex: 3 },
      ],
      outflows: [
        { id: "bill-1", kind: "outflow", amountCents: 90_000, weekIndex: 0 },
        { id: "bill-2", kind: "outflow", amountCents: 125_000, weekIndex: 2 },
      ],
      bufferTargetCents: 150_000,
      now: new Date("2026-09-07T00:00:00.000Z"),
    })

    assert.equal(first.inputHash, second.inputHash)
    assert.deepEqual(first.weeks, second.weeks)
  })

  test("flags stale or low-confidence inputs in the confidence assessment", () => {
    const forecast = buildCashPlanForecast({
      openingCashCents: 300_000,
      inflows: [
        {
          id: "receipt-1",
          kind: "inflow",
          amountCents: 50_000,
          weekIndex: 0,
          confidence: 0.35,
          sourceUpdatedAt: new Date("2026-08-01T00:00:00.000Z"),
        },
      ],
      outflows: [
        { id: "bill-1", kind: "outflow", amountCents: 120_000, weekIndex: 1 },
      ],
      now: new Date("2026-09-07T00:00:00.000Z"),
      bufferTargetCents: 200_000,
    })

    assert.ok(forecast.confidence < 100)
    assert.ok(forecast.dataQualityIssues.some((issue) => issue.severity === "high" || issue.severity === "medium"))
  })

  test("serializes the snapshot payload with the forecast hash and engine metadata", () => {
    const forecast = buildCashPlanForecast({
      openingCashCents: 500_000,
      inflows: [{ id: "invoice-1", kind: "inflow", amountCents: 40_000, weekIndex: 1 }],
      outflows: [{ id: "bill-1", kind: "outflow", amountCents: 30_000, weekIndex: 2 }],
      bufferTargetCents: 80_000,
      now: new Date("2026-09-07T00:00:00.000Z"),
    })

    const payload = buildCashPlanSnapshotPayload("plan_123", forecast, "scenario_456")

    assert.equal(payload.planId, "plan_123")
    assert.equal(payload.scenarioId, "scenario_456")
    assert.equal(payload.inputHash, forecast.inputHash)
    assert.equal(payload.engineVersion, forecast.engineVersion)
    assert.deepEqual(payload.weeks, forecast.weeks)
  })

  test("tracks immutable source lineage and override audit metadata for corrected cash facts", () => {
    const lineage = buildCashPlanSourceLineage({
      sourceSystem: "xero",
      sourceId: "invoice-42",
      sourceUpdatedAt: new Date("2026-08-01T00:00:00.000Z"),
      sourceHash: "abc123",
    })

    const audit = buildCashPlanOverrideAudit({
      factId: "fact-42",
      reason: "Customer confirmed revised payment date",
      owner: "ops@demo",
      createdBy: "user-1",
      effectiveFrom: new Date("2026-09-08T00:00:00.000Z"),
      sourceLineage: lineage,
    })

    assert.equal(lineage.sourceSystem, "xero")
    assert.equal(lineage.sourceId, "invoice-42")
    assert.equal(lineage.isImmutable, true)
    assert.equal(audit.reason, "Customer confirmed revised payment date")
    assert.equal(audit.sourceLineage.sourceId, "invoice-42")
    assert.equal(audit.isOverride, true)
  })

  test("applies defensible defaults and recalculates when settings or source events change", () => {
    assert.equal(defaultCashPlanSettings.currency, "aud")
    assert.equal(defaultCashPlanSettings.horizonWeeks, 13)

    const shouldRecalc = evaluateCashPlanRecalculationTriggers({
      trigger: "manual_override",
      changedAt: new Date("2026-09-07T00:00:00.000Z"),
      lastSnapshotAt: new Date("2026-09-05T00:00:00.000Z"),
    })

    assert.equal(shouldRecalc, true)
    assert.equal(
      evaluateCashPlanRecalculationTriggers({
        trigger: "none",
        changedAt: new Date("2026-09-07T00:00:00.000Z"),
        lastSnapshotAt: new Date("2026-09-07T00:00:00.000Z"),
      }),
      false,
    )
  })

  test("builds a clear overview summary with confidence, low point, freshness, and recommended actions", () => {
    const forecast = buildCashPlanForecast({
      openingCashCents: 900_000,
      inflows: [
        { id: "receipt-1", kind: "inflow", amountCents: 220_000, weekIndex: 2 },
        { id: "receipt-2", kind: "inflow", amountCents: 150_000, weekIndex: 5 },
      ],
      outflows: [
        { id: "bill-1", kind: "outflow", amountCents: 110_000, weekIndex: 1 },
        { id: "bill-2", kind: "outflow", amountCents: 160_000, weekIndex: 4 },
      ],
      bufferTargetCents: 200_000,
      now: new Date("2026-09-07T00:00:00.000Z"),
    })

    const summary = buildCashPlanOverviewSummary({
      forecast,
      updatedAt: new Date("2026-09-06T12:00:00.000Z"),
      title: "Base plan",
    })

    assert.equal(summary.title, "Base plan")
    assert.ok(summary.lowestClosingCashCents <= summary.latestClosingCashCents)
    assert.ok(summary.confidence >= 0)
    assert.ok(summary.recommendedActions.length > 0)
    assert.ok(summary.freshnessLabel.length > 0)
  })

  test("builds a plan workspace model with weekly totals, grouped items, and explainability notes", () => {
    const forecast = buildCashPlanForecast({
      openingCashCents: 800_000,
      inflows: [
        { id: "invoice-1", kind: "inflow", amountCents: 250_000, weekIndex: 0 },
        { id: "invoice-2", kind: "inflow", amountCents: 150_000, weekIndex: 2 },
      ],
      outflows: [
        { id: "rent", kind: "outflow", amountCents: 120_000, weekIndex: 0 },
        { id: "payroll", kind: "outflow", amountCents: 180_000, weekIndex: 2 },
      ],
      bufferTargetCents: 250_000,
      now: new Date("2026-09-07T00:00:00.000Z"),
    })

    const workspace = buildCashPlanPlanWorkspace({
      forecast,
      title: "Base plan",
    })

    assert.equal(workspace.title, "Base plan")
    assert.equal(workspace.weeks.length, 13)
    assert.ok(workspace.weeks.some((week) => week.items.some((item) => item.kind === "inflow")))
    assert.ok(workspace.weeks.some((week) => week.explainability.length > 0))
    assert.ok(workspace.summary.lowestClosingCashCents <= workspace.summary.latestClosingCashCents)
  })

  test("builds scenario templates and a comparison model for optimistic, conservative, and custom views", () => {
    const baseForecast = buildCashPlanForecast({
      openingCashCents: 900_000,
      inflows: [{ id: "invoice-1", kind: "inflow", amountCents: 200_000, weekIndex: 2 }],
      outflows: [{ id: "payroll", kind: "outflow", amountCents: 150_000, weekIndex: 1 }],
      bufferTargetCents: 250_000,
      now: new Date("2026-09-07T00:00:00.000Z"),
    })

    const optimistic = buildCashPlanScenario({
      id: "scenario-optimistic",
      type: "optimistic",
      label: "Optimistic",
      baseForecast,
      deltas: [{ kind: "item", id: "invoice-1", field: "amountCents", deltaCents: 50_000, reason: "Faster payment timing" }],
    })

    const conservative = buildCashPlanScenario({
      id: "scenario-conservative",
      type: "conservative",
      label: "Conservative",
      baseForecast,
      deltas: [{ kind: "item", id: "payroll", field: "amountCents", deltaCents: -40_000, reason: "Higher payroll cost" }],
    })

    const comparison = buildCashPlanScenarioComparison({
      baseForecast,
      scenarios: [optimistic, conservative],
    })

    assert.equal(optimistic.type, "optimistic")
    assert.ok(optimistic.previewDeltaCents > 0)
    assert.ok(conservative.previewDeltaCents < 0)
    assert.equal(comparison.scenarios.length, 2)
    assert.ok(comparison.scenarios.every((entry) => entry.comparisonLabel.length > 0))
  })

  test("builds ranked recommendations, deduplicated alerts, and a digest summary", () => {
    const forecast = buildCashPlanForecast({
      openingCashCents: 300_000,
      inflows: [{ id: "invoice-1", kind: "inflow", amountCents: 100_000, weekIndex: 3 }],
      outflows: [{ id: "vendor-1", kind: "outflow", amountCents: 220_000, weekIndex: 5 }],
      bufferTargetCents: 200_000,
      now: new Date("2026-09-07T00:00:00.000Z"),
    })

    const recommendations = buildCashPlanRecommendations({ forecast })
    const alert = buildCashPlanAlert({
      id: "alert-1",
      kind: "buffer_risk",
      title: "Cash buffer below target",
      message: "Buffer is below target in week 5.",
      severity: "high",
      thresholdCents: 200_000,
      currentCents: 120_000,
    })

    const digest = buildCashPlanDigest({
      forecast,
      recommendations,
      alerts: [alert],
    })

    assert.ok(recommendations.length > 0)
    assert.equal(alert.state, "active")
    assert.equal(alert.dedupeKey, "buffer_risk:200000:120000")
    assert.ok(digest.summary.length > 0)
    assert.ok(digest.actions.length > 0)
  })

  test("builds a summary payload used by the CashPlan API surface", () => {
    const forecast = buildCashPlanForecast({
      openingCashCents: 700_000,
      inflows: [{ id: "receipt-1", kind: "inflow", amountCents: 180_000, weekIndex: 4 }],
      outflows: [{ id: "tax", kind: "outflow", amountCents: 160_000, weekIndex: 3 }],
      bufferTargetCents: 200_000,
      now: new Date("2026-09-07T00:00:00.000Z"),
    })

    const summary = buildCashPlanSummaryResponse({
      forecast,
      title: "Base plan",
    })

    assert.equal(summary.title, "Base plan")
    assert.ok(summary.overview.confidence >= 0)
    assert.ok(summary.workspace.weeks.length >= 1)
    assert.ok(summary.recommendations.length >= 1)
  })

  test("ranks recommendations by forecast impact and deduplicates alert keys", () => {
    const forecast = buildCashPlanForecast({
      openingCashCents: 120_000,
      inflows: [{ id: "invoice-1", kind: "inflow", amountCents: 40_000, weekIndex: 1 }],
      outflows: [{ id: "payroll", kind: "outflow", amountCents: 180_000, weekIndex: 2 }],
      bufferTargetCents: 100_000,
      now: new Date("2026-09-07T00:00:00.000Z"),
    })

    const recommendations = buildCashPlanRecommendations({ forecast })
    const alert = buildCashPlanAlert({
      id: "alert-1",
      kind: "buffer_risk",
      title: "Buffer is at risk",
      message: "The cash buffer falls below target before the next payroll run.",
      severity: "high",
      thresholdCents: 100_000,
      currentCents: 80_000,
    })

    assert.ok(recommendations.length > 0)
    assert.ok(recommendations[0].estimatedImpactCents >= recommendations.at(-1)!.estimatedImpactCents)
    assert.equal(alert.dedupeKey, "buffer_risk:100000:80000")
  })
})
