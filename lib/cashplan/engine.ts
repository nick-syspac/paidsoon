import { createHash } from "node:crypto"

export type CashPlanItemKind = "inflow" | "outflow"
export type CashPlanConfidenceBand = "healthy" | "preliminary" | "stale"
export type CashPlanQualitySeverity = "low" | "medium" | "high"

export interface CashPlanLineItemInput {
  id: string
  kind: CashPlanItemKind
  amountCents: number
  weekIndex: number
  confidence?: number | null
  sourceUpdatedAt?: Date | null
}

export interface BuildCashPlanForecastInput {
  openingCashCents: number
  inflows: CashPlanLineItemInput[]
  outflows: CashPlanLineItemInput[]
  bufferTargetCents?: number
  now?: Date
}

export interface CashPlanForecastWeek {
  weekIndex: number
  openingCashCents: number
  inflowCents: number
  outflowCents: number
  netCents: number
  closingCashCents: number
  bufferGapCents: number
  bufferRatio: number
}

export interface CashPlanDataQualityIssue {
  type: "stale_source" | "low_confidence" | "missing_balance" | "timing_review"
  severity: CashPlanQualitySeverity
  message: string
  weekIndex?: number
}

export interface CashPlanForecast {
  engineVersion: string
  inputHash: string
  confidence: number
  status: CashPlanConfidenceBand
  lowestClosingCashCents: number
  bufferGapCents: number
  dataQualityIssues: CashPlanDataQualityIssue[]
  inflows: CashPlanLineItemInput[]
  outflows: CashPlanLineItemInput[]
  weeks: CashPlanForecastWeek[]
}

export interface CashPlanSnapshotPayload {
  planId: string
  scenarioId?: string | null
  inputHash: string
  engineVersion: string
  confidence: number
  status: string
  lowestClosingCashCents: number
  bufferGapCents: number
  weeks: CashPlanForecastWeek[]
}

export interface CashPlanOverviewSummary {
  title: string
  status: CashPlanConfidenceBand
  confidence: number
  lowestClosingCashCents: number
  latestClosingCashCents: number
  bufferGapCents: number
  freshnessLabel: string
  recommendedActions: string[]
}

export interface CashPlanWorkspaceItem {
  id: string
  kind: CashPlanItemKind
  amountCents: number
  weekIndex: number
  sourceLabel: string
  detailSummary: string[]
}

export interface CashPlanWorkspaceGroupedItems {
  inflows: CashPlanWorkspaceItem[]
  outflows: CashPlanWorkspaceItem[]
}

export interface CashPlanWorkspaceWeek {
  weekIndex: number
  openingCashCents: number
  closingCashCents: number
  netCents: number
  inflowTotalCents: number
  outflowTotalCents: number
  items: CashPlanWorkspaceItem[]
  groupedItems: CashPlanWorkspaceGroupedItems
  detailSummary: string[]
  explainability: string[]
}

export interface CashPlanPlanWorkspace {
  title: string
  summary: CashPlanOverviewSummary
  weeks: CashPlanWorkspaceWeek[]
}

export type CashPlanScenarioType = "base" | "optimistic" | "conservative" | "custom"

export interface CashPlanScenarioDelta {
  kind: "item" | "assumption"
  id: string
  field: string
  deltaCents: number
  reason: string
}

export interface CashPlanScenario {
  id: string
  type: CashPlanScenarioType
  label: string
  baseForecast: CashPlanForecast
  deltas: CashPlanScenarioDelta[]
  previewDeltaCents: number
  summary: string
}

export interface CashPlanScenarioComparisonEntry {
  scenarioId: string
  label: string
  previewDeltaCents: number
  comparisonLabel: string
}

export interface CashPlanScenarioComparison {
  scenarios: CashPlanScenarioComparisonEntry[]
}

export interface CashPlanRecommendation {
  id: string
  title: string
  summary: string
  priority: "high" | "medium" | "low"
  estimatedImpactCents: number
}

export interface CashPlanAlert {
  id: string
  kind: "buffer_risk" | "stale_source" | "manual_review"
  title: string
  message: string
  severity: "high" | "medium" | "low"
  thresholdCents: number
  currentCents: number
  state: "active" | "resolved"
  dedupeKey: string
}

export interface CashPlanDigest {
  summary: string
  actions: string[]
}

export interface CashPlanSummaryResponse {
  title: string
  overview: CashPlanOverviewSummary
  workspace: CashPlanPlanWorkspace
  recommendations: CashPlanRecommendation[]
  alerts: CashPlanAlert[]
  digest: CashPlanDigest
}

export interface CashPlanSetupAssessment {
  isReady: boolean
  missingFields: Array<"opening_cash" | "planned_obligations" | "cash_sources">
  status: "ready" | "preliminary" | "blocked"
  message: string
}

export interface CashPlanAccessibilitySummary {
  title: string
  statusLabel: string
  riskText: string
  keyboardHint: string
  reasonText: string
}

export interface CashPlanPilotReview {
  isReadyForPilot: boolean
  permissionSummary: string
  exportRetentionDays: number
  retentionText: string
  pilotStatus: string
}

export interface CashPlanCalendarEvent {
  id: string
  type: "risk" | "review" | "milestone"
  title: string
  weekIndex: number
  severity: "high" | "medium" | "low"
  message: string
  drillDown: string[]
}

export interface CashPlanCalendarModel {
  title: string
  summary: string
  events: CashPlanCalendarEvent[]
}

export interface CashPlanDataQualityIssueRow {
  id: string
  type: "stale_source" | "low_confidence" | "missing_balance" | "timing_review"
  severity: CashPlanQualitySeverity
  weekIndex?: number
  message: string
  remediation: string[]
}

export interface CashPlanDataQualityQueue {
  title: string
  summary: string
  issues: CashPlanDataQualityIssueRow[]
}

export interface CashPlanSourceLineage {
  sourceSystem: string
  sourceId: string
  sourceUpdatedAt: Date | null
  sourceHash: string
  isImmutable: true
}

export interface CashPlanOverrideAudit {
  factId: string
  reason: string
  owner: string | null
  createdBy: string | null
  effectiveFrom: Date | null
  sourceLineage: CashPlanSourceLineage
  isOverride: true
}

export interface CashPlanPlannedItem {
  id: string
  kind: CashPlanItemKind
  amountCents: number
  weekIndex: number
  reason: string
  owner: string | null
  createdBy: string | null
  effectiveFrom: Date | null
  expiresAt: Date | null
  sourceType: string
  sourceId: string | null
  audit: CashPlanOverrideAudit
}

export interface CashPlanManualOverride {
  id: string
  entityType: string
  entityId: string
  amountCents: number | null
  reason: string
  owner: string | null
  createdBy: string | null
  effectiveFrom: Date | null
  expiresAt: Date | null
  sourceType: string
  sourceId: string | null
  audit: CashPlanOverrideAudit
}

export interface CashPlanSettings {
  currency: string
  timezone: string
  horizonWeeks: number
  bufferTargetCents: number
  alertThresholdCents: number
  reviewRole: "owner" | "bookkeeper" | "approver"
}

export type CashPlanRecalculationTrigger =
  | "source_sync"
  | "manual_override"
  | "settings_change"
  | "expiry_event"
  | "none"

export const defaultCashPlanSettings: CashPlanSettings = {
  currency: "aud",
  timezone: "Australia/Sydney",
  horizonWeeks: 13,
  bufferTargetCents: 0,
  alertThresholdCents: 0,
  reviewRole: "owner",
}

export function evaluateCashPlanRecalculationTriggers(input: {
  trigger: CashPlanRecalculationTrigger
  changedAt: Date
  lastSnapshotAt: Date
}): boolean {
  if (input.trigger === "none") {
    return input.changedAt.getTime() !== input.lastSnapshotAt.getTime()
  }

  return ["source_sync", "manual_override", "settings_change", "expiry_event"].includes(input.trigger)
}

export function buildCashPlanSourceLineage(input: {
  sourceSystem: string
  sourceId: string
  sourceUpdatedAt?: Date | null
  sourceHash: string
}): CashPlanSourceLineage {
  return {
    sourceSystem: input.sourceSystem,
    sourceId: input.sourceId,
    sourceUpdatedAt: input.sourceUpdatedAt ?? null,
    sourceHash: input.sourceHash,
    isImmutable: true,
  }
}

export function buildCashPlanOverrideAudit(input: {
  factId: string
  reason: string
  owner?: string | null
  createdBy?: string | null
  effectiveFrom?: Date | null
  sourceLineage: CashPlanSourceLineage
}): CashPlanOverrideAudit {
  return {
    factId: input.factId,
    reason: input.reason,
    owner: input.owner ?? null,
    createdBy: input.createdBy ?? null,
    effectiveFrom: input.effectiveFrom ?? null,
    sourceLineage: input.sourceLineage,
    isOverride: true,
  }
}

export function buildCashPlanPlannedItem(input: {
  id: string
  kind: CashPlanItemKind
  amountCents: number
  weekIndex: number
  reason: string
  owner?: string | null
  createdBy?: string | null
  effectiveFrom?: Date | null
  expiresAt?: Date | null
  sourceType?: string
  sourceId?: string | null
  sourceLineage?: CashPlanSourceLineage
}): CashPlanPlannedItem {
  const sourceLineage = input.sourceLineage ?? buildCashPlanSourceLineage({
    sourceSystem: input.sourceType ?? "manual",
    sourceId: input.sourceId ?? input.id,
    sourceUpdatedAt: input.effectiveFrom ?? null,
    sourceHash: `${input.id}:${input.kind}:${input.amountCents}:${input.weekIndex}`,
  })

  return {
    id: input.id,
    kind: input.kind,
    amountCents: Math.max(0, Math.round(input.amountCents)),
    weekIndex: input.weekIndex,
    reason: input.reason,
    owner: input.owner ?? null,
    createdBy: input.createdBy ?? null,
    effectiveFrom: input.effectiveFrom ?? null,
    expiresAt: input.expiresAt ?? null,
    sourceType: input.sourceType ?? "manual",
    sourceId: input.sourceId ?? null,
    audit: buildCashPlanOverrideAudit({
      factId: input.id,
      reason: input.reason,
      owner: input.owner ?? null,
      createdBy: input.createdBy ?? null,
      effectiveFrom: input.effectiveFrom ?? null,
      sourceLineage,
    }),
  }
}

export function buildCashPlanManualOverride(input: {
  id: string
  entityType: string
  entityId: string
  amountCents: number | null
  reason: string
  owner?: string | null
  createdBy?: string | null
  effectiveFrom?: Date | null
  expiresAt?: Date | null
  sourceType?: string
  sourceId?: string | null
  sourceLineage: CashPlanSourceLineage
}): CashPlanManualOverride {
  return {
    id: input.id,
    entityType: input.entityType,
    entityId: input.entityId,
    amountCents: input.amountCents == null ? null : Math.max(0, Math.round(input.amountCents)),
    reason: input.reason,
    owner: input.owner ?? null,
    createdBy: input.createdBy ?? null,
    effectiveFrom: input.effectiveFrom ?? null,
    expiresAt: input.expiresAt ?? null,
    sourceType: input.sourceType ?? "manual",
    sourceId: input.sourceId ?? null,
    audit: buildCashPlanOverrideAudit({
      factId: input.entityId,
      reason: input.reason,
      owner: input.owner ?? null,
      createdBy: input.createdBy ?? null,
      effectiveFrom: input.effectiveFrom ?? null,
      sourceLineage: input.sourceLineage,
    }),
  }
}

export function buildCashPlanSnapshotPayload(
  planId: string,
  forecast: CashPlanForecast,
  scenarioId?: string | null,
): CashPlanSnapshotPayload {
  return {
    planId,
    scenarioId: scenarioId ?? null,
    inputHash: forecast.inputHash,
    engineVersion: forecast.engineVersion,
    confidence: forecast.confidence,
    status: forecast.status,
    lowestClosingCashCents: forecast.lowestClosingCashCents,
    bufferGapCents: forecast.bufferGapCents,
    weeks: forecast.weeks,
  }
}

export function buildCashPlanOverviewSummary(input: {
  forecast: CashPlanForecast
  updatedAt?: Date
  title?: string
}): CashPlanOverviewSummary {
  const weeks = input.forecast.weeks
  const latestClosingCashCents = weeks.at(-1)?.closingCashCents ?? input.forecast.lowestClosingCashCents
  const bufferGapCents = input.forecast.bufferGapCents
  const latestSourceIssue = input.forecast.dataQualityIssues.find(
    (issue) => issue.type === "stale_source" || issue.type === "low_confidence" || issue.type === "missing_balance",
  )

  const recommendedActions: string[] = []
  if (input.forecast.status === "stale") {
    recommendedActions.push("Re-check stale or missing cash inputs before relying on this forecast.")
  }
  if (input.forecast.lowestClosingCashCents < 0 || bufferGapCents < 0) {
    recommendedActions.push("Prioritise a buffer action to protect the lowest cash week.")
  }
  if (latestSourceIssue) {
    recommendedActions.push("Review the flagged cash facts and confirm the most recent numbers.")
  }
  if (recommendedActions.length === 0) {
    recommendedActions.push("Continue monitoring the plan; the base forecast remains stable.")
  }

  const freshnessLabel = input.forecast.dataQualityIssues.some((issue) => issue.type === "stale_source")
    ? "Needs a source refresh"
    : input.forecast.status === "preliminary"
      ? "Preliminary but usable"
      : "Fresh and ready for review"

  return {
    title: input.title ?? "Base plan",
    status: input.forecast.status,
    confidence: input.forecast.confidence,
    lowestClosingCashCents: input.forecast.lowestClosingCashCents,
    latestClosingCashCents,
    bufferGapCents,
    freshnessLabel,
    recommendedActions,
  }
}

export function buildCashPlanPlanWorkspace(input: {
  forecast: CashPlanForecast
  title?: string
}): CashPlanPlanWorkspace {
  const summary = buildCashPlanOverviewSummary({
    forecast: input.forecast,
    title: input.title ?? "Base plan",
  })

  const weeks: CashPlanWorkspaceWeek[] = input.forecast.weeks.map((week) => {
    const inflowItems: CashPlanWorkspaceItem[] = input.forecast.inflows
      .filter((item) => item.weekIndex === week.weekIndex)
      .map((item) => ({
        id: item.id,
        kind: item.kind,
        amountCents: item.amountCents,
        weekIndex: item.weekIndex,
        sourceLabel: item.id,
        detailSummary: [
          `${item.kind} source: ${item.id}`,
          `Estimated amount: ${item.amountCents} cents`,
        ],
      }))

    const outflowItems: CashPlanWorkspaceItem[] = input.forecast.outflows
      .filter((item) => item.weekIndex === week.weekIndex)
      .map((item) => ({
        id: item.id,
        kind: item.kind,
        amountCents: item.amountCents,
        weekIndex: item.weekIndex,
        sourceLabel: item.id,
        detailSummary: [
          `${item.kind} source: ${item.id}`,
          `Expected outflow: ${item.amountCents} cents`,
        ],
      }))

    const items: CashPlanWorkspaceItem[] = [...inflowItems, ...outflowItems]
    const inflowTotalCents = inflowItems.reduce((sum, item) => sum + item.amountCents, 0)
    const outflowTotalCents = outflowItems.reduce((sum, item) => sum + item.amountCents, 0)
    const groupedItems: CashPlanWorkspaceGroupedItems = {
      inflows: inflowItems,
      outflows: outflowItems,
    }

    const detailSummary = [
      `Inflow total: ${inflowTotalCents} cents`,
      `Outflow total: ${outflowTotalCents} cents`,
      `Net movement: ${week.netCents} cents`,
    ]

    const explainability = [
      `Opening cash: ${week.openingCashCents}`,
      `Net movement: ${week.netCents}`,
      `Closing cash: ${week.closingCashCents}`,
      week.bufferGapCents >= 0 ? `Buffer remains above target by ${week.bufferGapCents}` : `Buffer is below target by ${Math.abs(week.bufferGapCents)}`,
    ]

    return {
      weekIndex: week.weekIndex,
      openingCashCents: week.openingCashCents,
      closingCashCents: week.closingCashCents,
      netCents: week.netCents,
      inflowTotalCents,
      outflowTotalCents,
      items,
      groupedItems,
      detailSummary,
      explainability,
    }
  })

  return {
    title: input.title ?? "Base plan",
    summary,
    weeks,
  }
}

export function buildCashPlanScenario(input: {
  id: string
  type: CashPlanScenarioType
  label: string
  baseForecast: CashPlanForecast
  deltas: CashPlanScenarioDelta[]
}): CashPlanScenario {
  const previewDeltaCents = input.deltas.reduce((sum, delta) => sum + delta.deltaCents, 0)
  const summary = previewDeltaCents >= 0
    ? `Improves cash position by ${previewDeltaCents} cents.`
    : `Reduces cash position by ${Math.abs(previewDeltaCents)} cents.`

  return {
    id: input.id,
    type: input.type,
    label: input.label,
    baseForecast: input.baseForecast,
    deltas: input.deltas,
    previewDeltaCents,
    summary,
  }
}

export function buildCashPlanScenarioComparison(input: {
  baseForecast: CashPlanForecast
  scenarios: CashPlanScenario[]
}): CashPlanScenarioComparison {
  return {
    scenarios: input.scenarios.map((scenario) => ({
      scenarioId: scenario.id,
      label: scenario.label,
      previewDeltaCents: scenario.previewDeltaCents,
      comparisonLabel:
        scenario.previewDeltaCents >= 0
          ? `${scenario.label} is ${scenario.previewDeltaCents} cents above base`
          : `${scenario.label} is ${Math.abs(scenario.previewDeltaCents)} cents below base`,
    })),
  }
}

export function buildCashPlanRecommendations(input: { forecast: CashPlanForecast }): CashPlanRecommendation[] {
  const recommendations: CashPlanRecommendation[] = []

  const lowestWeek = input.forecast.weeks.reduce((lowest, week) =>
    week.closingCashCents < lowest.closingCashCents ? week : lowest,
  )

  if (lowestWeek.closingCashCents < 0) {
    recommendations.push({
      id: "buffer-risk",
      title: "Protect the weakest cash week",
      summary: `Immediate action: the lowest cash week is week ${lowestWeek.weekIndex}, which closes at ${lowestWeek.closingCashCents}. Rebalance cash before the shortfall becomes unmanageable.`,
      priority: "high",
      estimatedImpactCents: Math.abs(lowestWeek.closingCashCents) + 100_000,
    })
  }

  const staleIssue = input.forecast.dataQualityIssues.find((issue) => issue.type === "stale_source")
  if (staleIssue) {
    recommendations.push({
      id: "refresh-source",
      title: "Refresh stale source data",
      summary: `Check the stale cash source before relying on this plan: ${staleIssue.message}`,
      priority: "medium",
      estimatedImpactCents: 50_000,
    })
  }

  const riskGap = Math.max(0, Math.abs(input.forecast.bufferGapCents))
  if (riskGap > 0) {
    recommendations.push({
      id: "buffer-restoration",
      title: "Restore buffer coverage",
      summary: `The current buffer gap is ${riskGap} cents and should be closed before the low point arrives.`,
      priority: "medium",
      estimatedImpactCents: riskGap + 25_000,
    })
  }

  const lowConfidenceIssue = input.forecast.dataQualityIssues.find((issue) => issue.type === "low_confidence")
  if (lowConfidenceIssue) {
    recommendations.push({
      id: "confirm-confidence",
      title: "Confirm uncertain inflows",
      summary: `${lowConfidenceIssue.message} Review the item before acting on the plan.`,
      priority: "medium",
      estimatedImpactCents: 30_000,
    })
  }

  return recommendations.sort((left, right) => right.estimatedImpactCents - left.estimatedImpactCents)
}

export function buildCashPlanAlert(input: {
  id: string
  kind: CashPlanAlert["kind"]
  title: string
  message: string
  severity: CashPlanAlert["severity"]
  thresholdCents: number
  currentCents: number
}): CashPlanAlert {
  const dedupeKey = `${input.kind}:${input.thresholdCents}:${input.currentCents}`

  return {
    id: input.id,
    kind: input.kind,
    title: input.title,
    message: input.message,
    severity: input.severity,
    thresholdCents: input.thresholdCents,
    currentCents: input.currentCents,
    state: "active",
    dedupeKey,
  }
}

export function buildCashPlanDigest(input: {
  forecast: CashPlanForecast
  recommendations: CashPlanRecommendation[]
  alerts: CashPlanAlert[]
}): CashPlanDigest {
  const summary = `${input.forecast.status.toUpperCase()} forecast: lowest closing cash is ${input.forecast.lowestClosingCashCents}; confidence is ${input.forecast.confidence}.`
  const actions = [
    ...input.recommendations.map((recommendation) => recommendation.title),
    ...input.alerts.map((alert) => alert.title),
  ]

  return {
    summary,
    actions,
  }
}

export function evaluateCashPlanAlerts(forecast: CashPlanForecast): CashPlanAlert[] {
  const alerts: CashPlanAlert[] = []

  if (forecast.bufferGapCents < 0) {
    alerts.push(
      buildCashPlanAlert({
        id: "cashplan-buffer-risk",
        kind: "buffer_risk",
        title: "Buffer below target",
        message: `The forecast buffer gap is ${Math.abs(forecast.bufferGapCents)} cents before the lowest cash week.`,
        severity: forecast.bufferGapCents < -100_000 ? "high" : "medium",
        thresholdCents: Math.max(0, Math.abs(forecast.bufferGapCents)),
        currentCents: Math.abs(forecast.bufferGapCents),
      }),
    )
  }

  for (const issue of forecast.dataQualityIssues) {
    const alertKind = issue.type === "stale_source" ? "stale_source" : "manual_review"
    alerts.push(
      buildCashPlanAlert({
        id: `cashplan-${issue.type}-${issue.weekIndex ?? "all"}`,
        kind: alertKind,
        title: issue.type === "stale_source" ? "Source refresh needed" : "Cash data needs review",
        message: issue.message,
        severity: issue.severity === "high" ? "high" : issue.severity === "medium" ? "medium" : "low",
        thresholdCents: Math.max(0, issue.weekIndex != null ? issue.weekIndex * 10_000 : 0),
        currentCents: Math.abs(forecast.bufferGapCents),
      }),
    )
  }

  if (alerts.length === 0) {
    alerts.push(
      buildCashPlanAlert({
        id: "cashplan-buffer-watch",
        kind: "buffer_risk",
        title: "Review the buffer plan",
        message: "Monitor the lowest cash week and preserve the target buffer before the next payment cycle.",
        severity: "medium",
        thresholdCents: Math.max(0, forecast.bufferGapCents),
        currentCents: Math.abs(forecast.bufferGapCents),
      }),
    )
  }

  const deduped = new Map<string, CashPlanAlert>()
  for (const alert of alerts) {
    deduped.set(alert.dedupeKey, alert)
  }

  return [...deduped.values()].sort((left, right) => {
    const severityWeight = { high: 3, medium: 2, low: 1 }
    return severityWeight[right.severity] - severityWeight[left.severity]
  })
}

export function expireCashPlanOverrides(
  overrides: Array<{ id: string; expiresAt: Date | null }>,
  now = new Date(),
): string[] {
  return overrides
    .filter((override) => override.expiresAt && override.expiresAt.getTime() <= now.getTime())
    .map((override) => override.id)
}

export function rebuildCashPlanProjection(input: {
  forecast: CashPlanForecast
  title?: string
}): CashPlanSummaryResponse {
  return buildCashPlanSummaryResponse({
    forecast: input.forecast,
    title: input.title ?? "Base plan",
  })
}

export function buildCashPlanSetupAssessment(input: {
  openingCashCents: number
  inflows?: CashPlanLineItemInput[]
  outflows?: CashPlanLineItemInput[]
  now?: Date
}): CashPlanSetupAssessment {
  const inflows = input.inflows ?? []
  const outflows = input.outflows ?? []
  const missingFields: CashPlanSetupAssessment["missingFields"] = []

  if (input.openingCashCents <= 0) {
    missingFields.push("opening_cash")
  }

  if (outflows.length === 0 && inflows.length === 0) {
    missingFields.push("cash_sources")
  }

  if (outflows.length === 0 && inflows.length > 0) {
    missingFields.push("planned_obligations")
  }

  if (missingFields.length === 0) {
    return {
      isReady: true,
      missingFields: [],
      status: "ready",
      message: "CashPlan has enough opening cash and planned obligations to generate a forecast.",
    }
  }

  const isBlocked = missingFields.includes("opening_cash") || missingFields.includes("cash_sources")

  return {
    isReady: false,
    missingFields,
    status: isBlocked ? "blocked" : "preliminary",
    message: missingFields.includes("opening_cash")
      ? "Add opening cash before generating a dependable forecast."
      : "Add planned obligations or cash sources to complete the Base forecast setup.",
  }
}

export function buildCashPlanAccessibilitySummary(input: {
  forecast: CashPlanForecast
  title?: string
}): CashPlanAccessibilitySummary {
  const title = input.title ?? "Base plan"
  const hasRisk = input.forecast.bufferGapCents < 0 || input.forecast.lowestClosingCashCents < 0
  const statusLabel = hasRisk
    ? "Preliminary"
    : input.forecast.status === "stale"
      ? "Stale"
      : input.forecast.status === "healthy"
        ? "Healthy"
        : "Preliminary"

  const riskText = hasRisk
    ? `Risk review: ${title} is ${Math.abs(input.forecast.bufferGapCents)} cents below the target buffer in the lowest cash week. Review the plan before acting.`
    : `Risk review: ${title} remains buffered above target, but the lowest cash week still merits a human check.`

  const keyboardHint = "Use Tab to move through the review cards, Enter to open the detail panel, and Space to confirm a review action."
  const reasonText = input.forecast.dataQualityIssues.length > 0
    ? input.forecast.dataQualityIssues[0].message
    : hasRisk
      ? "This review stays accessible through text labels, status text, and keyboard navigation instead of colour alone."
      : `${title} is stable and readable without relying on colour cues for the cash risk state.`

  return {
    title,
    statusLabel,
    riskText,
    keyboardHint,
    reasonText,
  }
}

export function buildCashPlanPilotReview(input: {
  isPilotEnabled: boolean
  reviewRole: "owner" | "bookkeeper" | "approver"
  exportRetentionDays?: number
  maxPilotUsers?: number
}): CashPlanPilotReview {
  const retentionDays = Math.max(0, input.exportRetentionDays ?? 30)
  const maxPilotUsers = Math.max(1, input.maxPilotUsers ?? 25)
  const isReadyForPilot = input.isPilotEnabled && retentionDays >= 30 && maxPilotUsers >= 1 && ["owner", "bookkeeper", "approver"].includes(input.reviewRole)

  return {
    isReadyForPilot,
    permissionSummary: "Owner, bookkeeper, and approver review roles are allowed for pilot sign-off.",
    exportRetentionDays: retentionDays,
    retentionText: `Exports remain available for ${retentionDays} days before automatic cleanup, which preserves auditability while limiting stale pilot data.`,
    pilotStatus: isReadyForPilot ? "Pilot ready for a controlled rollout." : "Pilot review blocked until access and export retention are confirmed.",
  }
}

export function buildCashPlanCalendarModel(input: {
  forecast: CashPlanForecast
  title?: string
}): CashPlanCalendarModel {
  const title = input.title ?? "Base plan"
  const events: CashPlanCalendarEvent[] = input.forecast.weeks
    .filter((week) => week.bufferGapCents < 0 || week.closingCashCents < 0 || week.weekIndex % 3 === 0)
    .map((week) => ({
      id: `week-${week.weekIndex}`,
      type: week.bufferGapCents < 0 ? "risk" : "review",
      title: week.bufferGapCents < 0 ? "Buffer risk" : "Review week",
      weekIndex: week.weekIndex,
      severity: week.bufferGapCents < -100_000 ? "high" : week.bufferGapCents < 0 ? "medium" : "low",
      message: week.bufferGapCents < 0
        ? `Week ${week.weekIndex} closes ${Math.abs(week.bufferGapCents)} cents below the buffer target.`
        : `Week ${week.weekIndex} should be checked manually for timing or assumption drift.`,
      drillDown: [
        `Opening cash: ${week.openingCashCents}`,
        `Inflow total: ${week.inflowCents}`,
        `Outflow total: ${week.outflowCents}`,
        `Closing cash: ${week.closingCashCents}`,
      ],
    }))

  return {
    title,
    summary: `${events.length} days of review attention are highlighted in the calendar.`,
    events: events.length > 0 ? events : [{
      id: "week-0",
      type: "milestone",
      title: "Stable week",
      weekIndex: 0,
      severity: "low",
      message: "No material risk or review trigger is active in the current base forecast.",
      drillDown: [
        "No risk threshold is active for this week.",
        "Monitor the next payment cycle for any unexpected drift.",
      ],
    }],
  }
}

export function buildCashPlanDataQualityQueue(input: {
  forecast: CashPlanForecast
  title?: string
}): CashPlanDataQualityQueue {
  const title = input.title ?? "Base plan"
  const issues = input.forecast.dataQualityIssues.length > 0
    ? input.forecast.dataQualityIssues.map((issue, index) => ({
        id: `issue-${index}`,
        type: issue.type,
        severity: issue.severity,
        weekIndex: issue.weekIndex,
        message: issue.message,
        remediation: issue.type === "stale_source"
          ? [
              "Refresh the source data and confirm the latest invoice or withdrawal value.",
              "Re-run the forecast after the latest balance is captured.",
            ]
          : issue.type === "low_confidence"
            ? [
                "Review the receipt or obligation before acting on the forecast.",
                "Keep the assumption conservative until a trusted source is confirmed.",
              ]
            : issue.type === "missing_balance"
              ? [
                  "Add the opening cash or balance source before relying on the plan.",
                  "Treat the forecast as preliminary until the missing value is confirmed.",
                ]
              : [
                  "Review the timing assumption and confirm the relevant due date or cycle.",
                  "If the date is unresolved, use the conservative path until it is clarified.",
                ],
      }))
    : [{
        id: "issue-none",
        type: "timing_review",
        severity: "low",
        message: "No active data-quality issues are present in the current base forecast.",
        remediation: [
          "Continue monitoring the next payment cycle for timing or source drift.",
          "Re-check only if a source refresh or manual change affects the plan.",
        ],
      }]

  return {
    title,
    summary: `${issues.length} item${issues.length === 1 ? "" : "s"} are queued for review.`,
    issues,
  }
}

export function buildCashPlanSummaryResponse(input: {
  forecast: CashPlanForecast
  title?: string
  recommendations?: CashPlanRecommendation[]
  alerts?: CashPlanAlert[]
  digest?: CashPlanDigest
}): CashPlanSummaryResponse {
  const title = input.title ?? "Base plan"
  const overview = buildCashPlanOverviewSummary({
    forecast: input.forecast,
    title,
  })
  const workspace = buildCashPlanPlanWorkspace({
    forecast: input.forecast,
    title,
  })

  const baseRecommendations = input.recommendations && input.recommendations.length > 0
    ? input.recommendations
    : buildCashPlanRecommendations({ forecast: input.forecast })

  const fallbackRecommendation: CashPlanRecommendation = {
    id: "monitor-plan",
    title: "Keep monitoring the lowest cash week",
    summary: "The plan is stable, but a weekly review is still recommended to catch any late payment shifts early.",
    priority: "low",
    estimatedImpactCents: Math.abs(input.forecast.bufferGapCents),
  }

  const recommendations = baseRecommendations.length > 0 ? baseRecommendations : [fallbackRecommendation]

  const alertSeed: CashPlanAlert[] = input.alerts && input.alerts.length > 0
    ? input.alerts
    : (input.forecast.dataQualityIssues.length > 0
      ? input.forecast.dataQualityIssues.slice(0, 2).map((issue, index) =>
          buildCashPlanAlert({
            id: `quality-${index}`,
            kind: issue.type === "stale_source" ? "stale_source" : "manual_review",
            title: issue.type === "stale_source" ? "Source refresh needed" : "Cash data needs review",
            message: issue.message,
            severity: issue.severity === "high" ? "high" : issue.severity === "medium" ? "medium" : "low",
            thresholdCents: Math.max(0, issue.weekIndex != null ? issue.weekIndex * 10_000 : 0),
            currentCents: Math.abs(input.forecast.bufferGapCents),
          }),
        )
      : [
          buildCashPlanAlert({
            id: "buffer-watch",
            kind: "buffer_risk",
            title: "Review the buffer plan",
            message: "Monitor the lowest cash week and preserve the target buffer before the next payment cycle.",
            severity: "medium",
            thresholdCents: Math.max(0, input.forecast.bufferGapCents),
            currentCents: Math.abs(input.forecast.bufferGapCents),
          }),
        ])

  const alerts = alertSeed.length > 0 ? alertSeed : []
  const digest = input.digest ?? buildCashPlanDigest({
    forecast: input.forecast,
    recommendations,
    alerts,
  })

  return {
    title,
    overview,
    workspace,
    recommendations,
    alerts,
    digest,
  }
}

export function normalizeCashPlanFacts(
  inflows: CashPlanLineItemInput[],
  outflows: CashPlanLineItemInput[],
): { inflows: CashPlanLineItemInput[]; outflows: CashPlanLineItemInput[] } {
  const normalize = (items: CashPlanLineItemInput[]) => {
    const byId = new Map<string, CashPlanLineItemInput>()
    for (const item of items) {
      const amountCents = Math.max(0, Math.round(item.amountCents))
      const normalized = { ...item, amountCents }
      const uniqueKey = `${item.kind}:${item.id}:${item.weekIndex}`
      const existing = byId.get(uniqueKey)
      if (!existing || normalized.amountCents > existing.amountCents) {
        byId.set(uniqueKey, normalized)
      }
    }
    return [...byId.values()].sort(stableItemSort)
  }

  return {
    inflows: normalize(inflows),
    outflows: normalize(outflows),
  }
}

export interface CashPlanSourceFailure {
  sourceSystem: string
  sourceId: string
  reason: string
  at?: Date | null
}

export interface CashPlanCanonicalFactBundle {
  inflows: CashPlanLineItemInput[]
  outflows: CashPlanLineItemInput[]
  failedSources: CashPlanSourceFailure[]
  sourceHash: string
}

export function buildCashPlanCanonicalFactBundle(input: {
  inflows: Array<CashPlanLineItemInput & {
    sourceSystem?: string
    sourceId?: string
    sourceUpdatedAt?: Date | null
    sourceHash?: string
  }>
  outflows: Array<CashPlanLineItemInput & {
    sourceSystem?: string
    sourceId?: string
    sourceUpdatedAt?: Date | null
    sourceHash?: string
  }>
  failedSources?: CashPlanSourceFailure[]
}): CashPlanCanonicalFactBundle {
  const normalized = normalizeCashPlanFacts(input.inflows, input.outflows)
  const failedSources = (input.failedSources ?? []).map((source) => ({
    sourceSystem: source.sourceSystem,
    sourceId: source.sourceId,
    reason: source.reason,
    at: source.at ?? null,
  }))

  const sourceHash = createHash("sha256")
    .update(
      JSON.stringify({
        inflows: normalized.inflows.map((item) => ({
          id: item.id,
          kind: item.kind,
          amountCents: item.amountCents,
          weekIndex: item.weekIndex,
          sourceSystem: item.sourceSystem ?? "unknown",
          sourceId: item.sourceId ?? item.id,
          sourceUpdatedAt: toIso(item.sourceUpdatedAt),
          sourceHash: item.sourceHash ?? "",
        })),
        outflows: normalized.outflows.map((item) => ({
          id: item.id,
          kind: item.kind,
          amountCents: item.amountCents,
          weekIndex: item.weekIndex,
          sourceSystem: item.sourceSystem ?? "unknown",
          sourceId: item.sourceId ?? item.id,
          sourceUpdatedAt: toIso(item.sourceUpdatedAt),
          sourceHash: item.sourceHash ?? "",
        })),
        failedSources,
      }),
    )
    .digest("hex")

  return {
    inflows: normalized.inflows.map((item) => ({
      ...item,
      sourceSystem: item.sourceSystem ?? "unknown",
      sourceId: item.sourceId ?? item.id,
      sourceUpdatedAt: item.sourceUpdatedAt ?? null,
      sourceHash: item.sourceHash ?? "",
    })),
    outflows: normalized.outflows.map((item) => ({
      ...item,
      sourceSystem: item.sourceSystem ?? "unknown",
      sourceId: item.sourceId ?? item.id,
      sourceUpdatedAt: item.sourceUpdatedAt ?? null,
      sourceHash: item.sourceHash ?? "",
    })),
    failedSources,
    sourceHash,
  }
}

const FORECAST_WEEKS = 13

function stableItemSort(a: CashPlanLineItemInput, b: CashPlanLineItemInput): number {
  if (a.weekIndex !== b.weekIndex) return a.weekIndex - b.weekIndex
  if (a.kind !== b.kind) return a.kind.localeCompare(b.kind)
  return a.id.localeCompare(b.id)
}

function toIso(value: Date | null | undefined): string | null {
  if (!value) return null
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function createInputHash(input: BuildCashPlanForecastInput): string {
  const payload = JSON.stringify({
    openingCashCents: input.openingCashCents,
    bufferTargetCents: input.bufferTargetCents ?? 0,
    inflows: [...input.inflows].sort(stableItemSort).map((item) => ({
      id: item.id,
      kind: item.kind,
      amountCents: item.amountCents,
      weekIndex: item.weekIndex,
      confidence: item.confidence ?? null,
      sourceUpdatedAt: toIso(item.sourceUpdatedAt),
    })),
    outflows: [...input.outflows].sort(stableItemSort).map((item) => ({
      id: item.id,
      kind: item.kind,
      amountCents: item.amountCents,
      weekIndex: item.weekIndex,
      confidence: item.confidence ?? null,
      sourceUpdatedAt: toIso(item.sourceUpdatedAt),
    })),
  })

  return createHash("sha256").update(payload).digest("hex")
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function buildCashPlanForecast(input: BuildCashPlanForecastInput): CashPlanForecast {
  const now = input.now ?? new Date()
  const bufferTargetCents = input.bufferTargetCents ?? 0
  const { inflows, outflows } = normalizeCashPlanFacts(input.inflows, input.outflows)

  const issues: CashPlanDataQualityIssue[] = []
  let confidenceScore = 100

  if (input.openingCashCents <= 0) {
    confidenceScore -= 25
    issues.push({
      type: "missing_balance",
      severity: "high",
      message: "Opening cash is zero or negative, so the forecast should be treated as preliminary.",
    })
  }

  for (const item of [...inflows, ...outflows]) {
    if (item.confidence != null && item.confidence < 0.6) {
      confidenceScore -= 15
      issues.push({
        type: "low_confidence",
        severity: item.amountCents >= 100_000 ? "high" : "medium",
        message: `${item.id} has low confidence and should be reviewed before it is trusted.`,
        weekIndex: item.weekIndex,
      })
    }

    if (item.sourceUpdatedAt) {
      const ageDays = Math.max(0, (now.getTime() - item.sourceUpdatedAt.getTime()) / (1000 * 60 * 60 * 24))
      if (ageDays > 45) {
        confidenceScore -= 20
        issues.push({
          type: "stale_source",
          severity: ageDays > 90 ? "high" : "medium",
          message: `${item.id} is stale and may not represent current cash reality.`,
          weekIndex: item.weekIndex,
        })
      } else if (ageDays > 21) {
        confidenceScore -= 8
        issues.push({
          type: "timing_review",
          severity: "low",
          message: `${item.id} has not been refreshed recently and may need a manual check.`,
          weekIndex: item.weekIndex,
        })
      }
    }
  }

  const weeks: CashPlanForecastWeek[] = []
  let runningCash = input.openingCashCents

  for (let weekIndex = 0; weekIndex < FORECAST_WEEKS; weekIndex += 1) {
    const inflowCents = inflows
      .filter((item) => item.kind === "inflow" && item.weekIndex === weekIndex)
      .reduce((sum, item) => sum + Math.max(0, item.amountCents), 0)

    const outflowCents = outflows
      .filter((item) => item.kind === "outflow" && item.weekIndex === weekIndex)
      .reduce((sum, item) => sum + Math.max(0, item.amountCents), 0)

    const openingCashCents = runningCash
    const netCents = inflowCents - outflowCents
    const closingCashCents = openingCashCents + netCents
    const bufferGapCents = closingCashCents - bufferTargetCents
    const bufferRatio = bufferTargetCents > 0 ? closingCashCents / bufferTargetCents : 1

    weeks.push({
      weekIndex,
      openingCashCents,
      inflowCents,
      outflowCents,
      netCents,
      closingCashCents,
      bufferGapCents,
      bufferRatio,
    })

    runningCash = closingCashCents
  }

  const lowestClosingCashCents = weeks.reduce((lowest, week) => Math.min(lowest, week.closingCashCents), Number.POSITIVE_INFINITY)
  const bufferGapCents = lowestClosingCashCents - bufferTargetCents
  confidenceScore = clamp(confidenceScore, 0, 100)

  return {
    engineVersion: "cashplan-v1",
    inputHash: createInputHash(input),
    confidence: confidenceScore,
    status: confidenceScore >= 85 ? "healthy" : confidenceScore >= 60 ? "preliminary" : "stale",
    lowestClosingCashCents,
    bufferGapCents,
    dataQualityIssues: issues,
    inflows,
    outflows,
    weeks,
  }
}
