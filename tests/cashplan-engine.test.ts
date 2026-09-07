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
  evaluateCashPlanAlerts,
  expireCashPlanOverrides,
  rebuildCashPlanProjection,
  buildCashPlanCanonicalFactBundle,
  buildCashPlanSetupAssessment,
  buildCashPlanAccessibilitySummary,
  buildCashPlanPilotReview,
  buildCashPlanCalendarModel,
  buildCashPlanDataQualityQueue,
  buildCashPlanPlannedItem,
  buildCashPlanManualOverride,
} from "@/lib/cashplan/engine"
import { buildCashPlanDashboardStatus } from "@/lib/dashboard/cashPlanStatus"

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

  test("formats a dashboard-ready CashPlan status summary for UI display", () => {
    const forecast = buildCashPlanForecast({
      openingCashCents: 600_000,
      inflows: [{ id: "invoice-1", kind: "inflow", amountCents: 150_000, weekIndex: 2 }],
      outflows: [{ id: "payroll", kind: "outflow", amountCents: 200_000, weekIndex: 4 }],
      bufferTargetCents: 120_000,
      now: new Date("2026-09-07T00:00:00.000Z"),
    })

    const status = buildCashPlanDashboardStatus({
      summary: buildCashPlanSummaryResponse({ forecast, title: "Base plan" }),
      hasPlan: true,
    })

    assert.equal(status.title, "Base plan")
    assert.ok(status.summaryLabel.length > 0)
    assert.ok(status.primaryActionHref.length > 0)
    assert.ok(status.recommendedActions.length > 0)
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

  test("includes grouped inflow and outflow totals with item-level detail for each plan week", () => {
    const forecast = buildCashPlanForecast({
      openingCashCents: 750_000,
      inflows: [
        { id: "invoice-1", kind: "inflow", amountCents: 200_000, weekIndex: 1, confidence: 0.9 },
        { id: "invoice-2", kind: "inflow", amountCents: 75_000, weekIndex: 1, confidence: 0.7 },
      ],
      outflows: [
        { id: "rent", kind: "outflow", amountCents: 120_000, weekIndex: 1 },
        { id: "supplies", kind: "outflow", amountCents: 35_000, weekIndex: 1 },
      ],
      bufferTargetCents: 150_000,
      now: new Date("2026-09-07T00:00:00.000Z"),
    })

    const workspace = buildCashPlanPlanWorkspace({
      forecast,
      title: "Base plan",
    })

    const week = workspace.weeks.find((entry) => entry.weekIndex === 1) ?? workspace.weeks[0]

    assert.ok(week.groupedItems.inflows.length >= 1)
    assert.ok(week.groupedItems.outflows.length >= 1)
    assert.ok(week.inflowTotalCents > 0)
    assert.ok(week.outflowTotalCents > 0)
    assert.ok(week.detailSummary.length > 0)
    assert.ok(week.groupedItems.inflows[0].detailSummary.length > 0)
  })

  test("builds a calendar and data-quality review model with risk highlighting and remediation steps", () => {
    const forecast = buildCashPlanForecast({
      openingCashCents: 400_000,
      inflows: [
        { id: "invoice-1", kind: "inflow", amountCents: 90_000, weekIndex: 2, confidence: 0.9 },
        { id: "invoice-2", kind: "inflow", amountCents: 60_000, weekIndex: 5, confidence: 0.5 },
      ],
      outflows: [
        { id: "rent", kind: "outflow", amountCents: 170_000, weekIndex: 2 },
        { id: "software", kind: "outflow", amountCents: 90_000, weekIndex: 4 },
      ],
      bufferTargetCents: 180_000,
      now: new Date("2026-09-07T00:00:00.000Z"),
    })

    const calendar = buildCashPlanCalendarModel({ forecast, title: "Base plan" })
    const qualityQueue = buildCashPlanDataQualityQueue({ forecast, title: "Base plan" })

    assert.equal(calendar.title, "Base plan")
    assert.ok(calendar.events.some((event) => event.type === "risk" || event.type === "review"))
    assert.ok(calendar.events.every((event) => event.drillDown.length > 0))
    assert.ok(qualityQueue.issues.length >= 1)
    assert.ok(qualityQueue.issues.every((issue) => issue.remediation.length > 0))
    assert.ok(qualityQueue.summary.length > 0)
  })

  test("builds a manual planned item and override record with reason, owner, expiry, and audit metadata", () => {
    const sourceLineage = buildCashPlanSourceLineage({
      sourceSystem: "xero",
      sourceId: "bill-42",
      sourceUpdatedAt: new Date("2026-09-01T00:00:00.000Z"),
      sourceHash: "manual-override-hash",
    })

    const plannedItem = buildCashPlanPlannedItem({
      id: "manual-item-1",
      kind: "outflow",
      amountCents: 45_000,
      weekIndex: 3,
      reason: "Confirmed annual software renewal",
      owner: "ops@demo",
      createdBy: "user-1",
      effectiveFrom: new Date("2026-09-10T00:00:00.000Z"),
      expiresAt: new Date("2026-10-15T00:00:00.000Z"),
      sourceType: "manual",
      sourceId: "manual-item-1",
    })

    const override = buildCashPlanManualOverride({
      id: "override-1",
      entityType: "outflow",
      entityId: "bill-42",
      amountCents: 45_000,
      reason: "Confirmed annual software renewal",
      owner: "ops@demo",
      createdBy: "user-1",
      effectiveFrom: new Date("2026-09-10T00:00:00.000Z"),
      expiresAt: new Date("2026-10-15T00:00:00.000Z"),
      sourceType: "manual",
      sourceId: "manual-item-1",
      sourceLineage,
    })

    assert.equal(plannedItem.kind, "outflow")
    assert.equal(plannedItem.audit.reason, "Confirmed annual software renewal")
    assert.equal(plannedItem.owner, "ops@demo")
    assert.equal(plannedItem.expiresAt?.toISOString(), "2026-10-15T00:00:00.000Z")
    assert.equal(override.entityType, "outflow")
    assert.equal(override.audit.sourceLineage.sourceId, "bill-42")
    assert.equal(override.audit.isOverride, true)
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

  test("evaluates worker job outputs for alerts, expiry, and projection rebuilds", () => {
    const forecast = buildCashPlanForecast({
      openingCashCents: 900_000,
      inflows: [{ id: "invoice-1", kind: "inflow", amountCents: 220_000, weekIndex: 4 }],
      outflows: [{ id: "payroll", kind: "outflow", amountCents: 180_000, weekIndex: 5 }],
      bufferTargetCents: 150_000,
      now: new Date("2026-09-07T00:00:00.000Z"),
    })

    const alerts = evaluateCashPlanAlerts(forecast)
    const projection = rebuildCashPlanProjection({
      forecast,
      title: "Base plan",
    })
    const expired = expireCashPlanOverrides([
      { id: "override-1", expiresAt: new Date("2026-09-06T00:00:00.000Z") },
      { id: "override-2", expiresAt: new Date("2026-09-08T00:00:00.000Z") },
      { id: "override-3", expiresAt: null },
    ])

    assert.ok(alerts.length >= 1)
    assert.equal(projection.title, "Base plan")
    assert.deepEqual(expired, ["override-1"])
  })

  test("ranks recommendations by urgency and materiality rather than impact alone", () => {
    const forecast = buildCashPlanForecast({
      openingCashCents: 100_000,
      inflows: [{ id: "invoice-1", kind: "inflow", amountCents: 30_000, weekIndex: 2, confidence: 0.49, sourceUpdatedAt: new Date("2026-07-01T00:00:00.000Z") }],
      outflows: [{ id: "payroll", kind: "outflow", amountCents: 180_000, weekIndex: 3 }],
      bufferTargetCents: 80_000,
      now: new Date("2026-09-07T00:00:00.000Z"),
    })

    const recommendations = buildCashPlanRecommendations({ forecast })

    assert.ok(recommendations.length >= 2)
    assert.ok(recommendations[0].summary.toLowerCase().includes("immediate") || recommendations[0].summary.toLowerCase().includes("before"))
    assert.ok(recommendations[0].estimatedImpactCents >= recommendations.at(-1)!.estimatedImpactCents)
  })

  test("preserves source provenance and failed-import state when canonicalising imported cash facts", () => {
    const bundle = buildCashPlanCanonicalFactBundle({
      inflows: [
        {
          id: "invoice-42",
          kind: "inflow",
          amountCents: 500_000,
          weekIndex: 1,
          sourceSystem: "xero",
          sourceId: "invoice-42",
          sourceUpdatedAt: new Date("2026-09-06T10:00:00.000Z"),
          sourceHash: "hash-1",
        },
      ],
      outflows: [
        {
          id: "bill-7",
          kind: "outflow",
          amountCents: 250_000,
          weekIndex: 2,
          sourceSystem: "csv-import",
          sourceId: "bill-7",
          sourceUpdatedAt: new Date("2026-09-06T12:00:00.000Z"),
          sourceHash: "hash-2",
        },
      ],
      failedSources: [{ sourceSystem: "myob", sourceId: "expense-99", reason: "sync error" }],
    })

    assert.equal(bundle.inflows[0].sourceSystem, "xero")
    assert.equal(bundle.outflows[0].sourceId, "bill-7")
    assert.equal(bundle.failedSources[0].reason, "sync error")
    assert.ok(bundle.sourceHash.length > 0)
  })

  test("integrates stale-source handling and override expiry into the same deterministic forecast flow", () => {
    const staleForecast = buildCashPlanForecast({
      openingCashCents: 400_000,
      inflows: [
        {
          id: "invoice-9",
          kind: "inflow",
          amountCents: 180_000,
          weekIndex: 2,
          confidence: 0.4,
          sourceUpdatedAt: new Date("2026-07-01T00:00:00.000Z"),
        },
      ],
      outflows: [{ id: "payroll", kind: "outflow", amountCents: 160_000, weekIndex: 4 }],
      bufferTargetCents: 200_000,
      now: new Date("2026-09-07T00:00:00.000Z"),
    })

    const overrideAudit = buildCashPlanOverrideAudit({
      factId: "invoice-9",
      reason: "Override for delayed April receipt",
      owner: "finance",
      createdBy: "user-1",
      effectiveFrom: new Date("2026-09-07T00:00:00.000Z"),
      sourceLineage: buildCashPlanSourceLineage({
        sourceSystem: "xero",
        sourceId: "invoice-9",
        sourceUpdatedAt: new Date("2026-08-15T00:00:00.000Z"),
        sourceHash: "hash-stale",
      }),
    })

    const expired = expireCashPlanOverrides([
      { id: "override-live", expiresAt: new Date("2026-09-10T00:00:00.000Z") },
      { id: "override-expired", expiresAt: new Date("2026-09-06T00:00:00.000Z") },
      { id: "override-open", expiresAt: null },
    ])

    assert.ok(staleForecast.dataQualityIssues.some((issue) => issue.type === "stale_source"))
    assert.equal(overrideAudit.sourceLineage.sourceId, "invoice-9")
    assert.deepEqual(expired, ["override-expired"])
  })

  test("assesses setup readiness and flags incomplete opening cash or missing obligations", () => {
    const missingOpeningCash = buildCashPlanSetupAssessment({
      openingCashCents: 0,
      inflows: [{ id: "invoice-1", kind: "inflow", amountCents: 50_000, weekIndex: 1 }],
      outflows: [{ id: "rent", kind: "outflow", amountCents: 40_000, weekIndex: 0 }],
      now: new Date("2026-09-07T00:00:00.000Z"),
    })

    const missingObligations = buildCashPlanSetupAssessment({
      openingCashCents: 250_000,
      inflows: [{ id: "invoice-2", kind: "inflow", amountCents: 70_000, weekIndex: 2 }],
      outflows: [],
      now: new Date("2026-09-07T00:00:00.000Z"),
    })

    assert.equal(missingOpeningCash.isReady, false)
    assert.ok(missingOpeningCash.missingFields.includes("opening_cash"))
    assert.equal(missingObligations.isReady, false)
    assert.ok(missingObligations.missingFields.includes("planned_obligations"))
  })

  test("provides text-only accessibility labels for risk and keyboard review actions", () => {
    const summary = buildCashPlanAccessibilitySummary({
      forecast: buildCashPlanForecast({
        openingCashCents: 250_000,
        inflows: [{ id: "invoice-1", kind: "inflow", amountCents: 75_000, weekIndex: 2 }],
        outflows: [{ id: "payroll", kind: "outflow", amountCents: 190_000, weekIndex: 4 }],
        bufferTargetCents: 150_000,
        now: new Date("2026-09-07T00:00:00.000Z"),
      }),
      title: "Base plan",
    })

    assert.equal(summary.statusLabel, "Preliminary")
    assert.match(summary.riskText, /risk|review|buffer/i)
    assert.match(summary.keyboardHint, /Tab|Enter|Space/i)
    assert.ok(summary.reasonText.length > 0)
  })

  test("reviews pilot configuration, permissions, and export retention before broader rollout", () => {
    const review = buildCashPlanPilotReview({
      isPilotEnabled: true,
      reviewRole: "approver",
      exportRetentionDays: 30,
      maxPilotUsers: 25,
    })

    assert.equal(review.isReadyForPilot, true)
    assert.equal(review.permissionSummary, "Owner, bookkeeper, and approver review roles are allowed for pilot sign-off.")
    assert.equal(review.exportRetentionDays, 30)
    assert.match(review.retentionText, /30|days/i)
    assert.match(review.pilotStatus, /pilot|ready/i)
  })
})
