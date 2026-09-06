export const BASELINE_WINDOWS = [3, 6, 12] as const

export type BaselineWindow = (typeof BASELINE_WINDOWS)[number]

export interface BaselineCalculationInput {
  values: number[]
}

export interface BaselineCalculation {
  sampleCount: number
  averageCents: number
  medianCents: number
  confidence: number
  minCents: number
  maxCents: number
}

export interface MaterialityInput {
  actualCents: number
  baselineCents: number
  percentageThreshold: number
  absoluteThresholdCents: number
}

export interface MaterialityEvaluation {
  varianceAmountCents: number
  variancePercent: number
  passes: boolean
}

export interface DriftDetectionInput {
  actualCents: number
  baselineCents: number
  percentageThreshold: number
  absoluteThresholdCents: number
}

export interface DriftDetectionResult {
  triggered: boolean
  varianceAmountCents: number
  variancePercent: number
  confidence: number
  reason: string
}

export interface SpendVelocityInput {
  currentMonthToDateCents: number
  baselineMonthToDateCents: number
  percentageThreshold: number
  absoluteThresholdCents: number
}

export interface DuplicateSpendInput {
  currentAmountCents: number
  baselineCents: number
  thresholdCents: number
  duplicateReferenceCount: number
}

export interface UnusualInvoiceInput {
  actualCents: number
  baselineCents: number
  percentageThreshold: number
  absoluteThresholdCents: number
}

export interface NewSupplierInput {
  actualCents: number
  historicalCents: number
  thresholdCents: number
}

export interface RecurringCostInput {
  currentRecurringCents: number
  baselineRecurringCents: number
  percentageThreshold: number
  absoluteThresholdCents: number
}

export interface ForecastInput {
  actualSpendCents: number
  recurringCommitmentsCents: number
  expectedVariableSpendCents: number
  baselineSpendCents?: number
}

export interface ForecastSummary {
  actualSpendCents: number
  recurringCommitmentsCents: number
  expectedVariableSpendCents: number
  projectedMonthEndCents: number
  varianceAmountCents: number
  variancePercent: number
  confidence: number
}

export interface CostGuardForecastSummary {
  projectedMonthEndCents: number
  varianceAmountCents: number
  variancePercent: number
  confidence: number
  status: "on_track" | "watch" | "over_target"
  message: string
}

export const COST_GUARD_ALERT_EVENT_TYPES = {
  CREATED: "COST_GUARD_ALERT_CREATED",
  ACKNOWLEDGED: "COST_GUARD_ALERT_ACKNOWLEDGED",
  EXPECTED: "COST_GUARD_ALERT_EXPECTED",
  SNOOZED: "COST_GUARD_ALERT_SNOOZED",
  RESOLVED: "COST_GUARD_ALERT_RESOLVED",
  RULE_CHANGED: "COST_GUARD_RULE_CHANGED",
} as const

export type CostGuardAlertStatus =
  | "new"
  | "acknowledged"
  | "expected"
  | "snoozed"
  | "investigating"
  | "resolved"
  | "ignored"

export interface CostGuardAlertLifecycleTransition {
  currentStatus: CostGuardAlertStatus
  nextStatus: CostGuardAlertStatus
}

export interface CostGuardAlertDeduplicationInput {
  userId: string
  alertType: string
  supplierId?: string | null
  categoryId?: string | null
  transactionId?: string | null
  amountCents?: number | null
}

export interface CostGuardRuleDefinition {
  id: string
  name: string
  ruleType:
    | "supplier_increase"
    | "category_increase"
    | "large_unusual_invoice"
    | "duplicate_spend"
    | "new_supplier"
    | "recurring_increase"
    | "forecast_overrun"
  severity: "info" | "watch" | "warning" | "critical"
  defaultPercentageThreshold: number
  defaultAbsoluteThresholdCents: number
  enabled: boolean
  description: string
}

export function normalizeCostGuardAlertStatus(status: string | null | undefined): CostGuardAlertStatus {
  const normalized = (status ?? "new").trim().toLowerCase().replace(/[^a-z_]/g, "")

  if (normalized === "acknowledged") return "acknowledged"
  if (normalized === "expected") return "expected"
  if (normalized === "snoozed") return "snoozed"
  if (normalized === "investigating") return "investigating"
  if (normalized === "resolved") return "resolved"
  if (normalized === "ignored") return "ignored"
  return "new"
}

export function canTransitionCostGuardAlertStatus(
  currentStatus: string | null | undefined,
  nextStatus: string | null | undefined,
): boolean {
  const current = normalizeCostGuardAlertStatus(currentStatus)
  const next = normalizeCostGuardAlertStatus(nextStatus)

  const transitions: Record<CostGuardAlertStatus, CostGuardAlertStatus[]> = {
    new: ["acknowledged", "expected", "snoozed", "investigating", "ignored"],
    acknowledged: ["expected", "snoozed", "investigating", "resolved", "ignored"],
    expected: ["acknowledged", "snoozed", "investigating", "resolved", "ignored"],
    snoozed: ["acknowledged", "expected", "investigating", "resolved", "ignored"],
    investigating: ["acknowledged", "expected", "snoozed", "resolved", "ignored"],
    resolved: ["ignored"],
    ignored: ["acknowledged", "expected", "investigating", "resolved"],
  }

  return transitions[current]?.includes(next) ?? false
}

export function createCostGuardAlertDeduplicationKey(input: CostGuardAlertDeduplicationInput): string {
  const userId = (input.userId ?? "").trim()
  const alertType = (input.alertType ?? "").trim()
  const supplierId = (input.supplierId ?? "").trim()
  const categoryId = (input.categoryId ?? "").trim()
  const transactionId = (input.transactionId ?? "").trim()
  const amountCents = input.amountCents ?? 0

  const signature = [userId, alertType, supplierId || "supplier:none", categoryId || "category:none", transactionId || "txn:none", String(amountCents)]
  return `cost-guard:${signature.join("|")}`
}

export function buildCostGuardAlertEventTypeForStatus(status: string | null | undefined): string {
  switch (normalizeCostGuardAlertStatus(status)) {
    case "new":
      return COST_GUARD_ALERT_EVENT_TYPES.CREATED
    case "acknowledged":
      return COST_GUARD_ALERT_EVENT_TYPES.ACKNOWLEDGED
    case "expected":
      return COST_GUARD_ALERT_EVENT_TYPES.EXPECTED
    case "snoozed":
      return COST_GUARD_ALERT_EVENT_TYPES.SNOOZED
    case "resolved":
      return COST_GUARD_ALERT_EVENT_TYPES.RESOLVED
    default:
      return COST_GUARD_ALERT_EVENT_TYPES.CREATED
  }
}

export interface CostGuardAlertLifecycleSummary {
  status: CostGuardAlertStatus
  label: string
  isTerminal: boolean
  eventType: string
}

export interface CostGuardAlertRecordInput {
  userId: string
  alertType: string
  supplierId?: string | null
  categoryId?: string | null
  transactionId?: string | null
  severity?: "info" | "watch" | "warning" | "critical"
  title: string
  description: string
  baselineAmountCents: number
  actualAmountCents: number
  varianceAmountCents: number
  variancePercent: number
  confidence?: number
  status?: string
}

export interface CostGuardAlertEventRecordInput {
  userId: string
  alertId: string
  status: string
  actorId?: string | null
  reason?: string | null
  metadata?: Record<string, unknown> | null
}

export interface CostGuardAlertSummaryInput {
  id: string
  userId: string
  alertType: string
  severity: "info" | "watch" | "warning" | "critical"
  title: string
  description: string
  baselineAmountCents: number
  actualAmountCents: number
  varianceAmountCents: number
  variancePercent: number
  confidence: number
  status: string
  detectedAt: string | Date
  supplierId?: string | null
  categoryId?: string | null
  transactionId?: string | null
}

export interface CostGuardAlertSummary {
  id: string
  userId: string
  alertType: string
  severity: "info" | "watch" | "warning" | "critical"
  title: string
  description: string
  baselineAmountCents: number
  actualAmountCents: number
  varianceAmountCents: number
  variancePercent: number
  confidence: number
  status: CostGuardAlertStatus
  detectedAt: string
  lifecycle: CostGuardAlertLifecycleSummary
  message: string
}

export function buildCostGuardAlertLifecycleSummary(status: string | null | undefined): CostGuardAlertLifecycleSummary {
  const normalized = normalizeCostGuardAlertStatus(status)

  const labels: Record<CostGuardAlertStatus, string> = {
    new: "New",
    acknowledged: "Acknowledged",
    expected: "Expected",
    snoozed: "Snoozed",
    investigating: "Investigating",
    resolved: "Resolved",
    ignored: "Ignored",
  }

  return {
    status: normalized,
    label: labels[normalized] ?? "New",
    isTerminal: normalized === "resolved" || normalized === "ignored",
    eventType: buildCostGuardAlertEventTypeForStatus(normalized),
  }
}

export function buildCostGuardAlertRecord(input: CostGuardAlertRecordInput) {
  return {
    userId: input.userId,
    alertType: input.alertType,
    supplierId: input.supplierId ?? null,
    categoryId: input.categoryId ?? null,
    transactionId: input.transactionId ?? null,
    severity: input.severity ?? "warning",
    title: input.title,
    description: input.description,
    baselineAmountCents: input.baselineAmountCents,
    actualAmountCents: input.actualAmountCents,
    varianceAmountCents: input.varianceAmountCents,
    variancePercent: input.variancePercent,
    confidence: Math.max(0, Math.min(100, input.confidence ?? 0)),
    status: normalizeCostGuardAlertStatus(input.status ?? "new"),
  }
}

export async function upsertCostGuardAlertRecord({
  tx,
  input,
}: {
  tx: {
    costGuardAlert: {
      findFirst?: (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>
      findMany?: (args: Record<string, unknown>) => Promise<Array<Record<string, unknown>>>
      create: (args: Record<string, unknown>) => Promise<Record<string, unknown>>
      update: (args: Record<string, unknown>) => Promise<Record<string, unknown>>
    }
  }
  input: CostGuardAlertRecordInput
}): Promise<Record<string, unknown>> {
  const record = buildCostGuardAlertRecord(input)
  const dedupeKey = createCostGuardAlertDeduplicationKey({
    userId: record.userId,
    alertType: record.alertType,
    supplierId: record.supplierId,
    categoryId: record.categoryId,
    transactionId: record.transactionId,
    amountCents: record.actualAmountCents,
  })

  const existing = await (async () => {
    if (typeof tx.costGuardAlert.findMany === "function") {
      return tx.costGuardAlert.findMany({
        where: {
          userId: record.userId,
          alertType: record.alertType,
        },
        select: {
          id: true,
          userId: true,
          alertType: true,
          supplierId: true,
          categoryId: true,
          transactionId: true,
          actualAmountCents: true,
          varianceAmountCents: true,
          status: true,
        },
      })
    }

    if (typeof tx.costGuardAlert.findFirst === "function") {
      const candidate = await tx.costGuardAlert.findFirst({
        where: {
          userId: record.userId,
          alertType: record.alertType,
        },
        select: {
          id: true,
          userId: true,
          alertType: true,
          supplierId: true,
          categoryId: true,
          transactionId: true,
          actualAmountCents: true,
          varianceAmountCents: true,
          status: true,
        },
      })
      return candidate ? [candidate] : []
    }

    return []
  })()

  const match = existing.find((row) => {
    const candidate = createCostGuardAlertDeduplicationKey({
      userId: String(row.userId),
      alertType: String(row.alertType),
      supplierId: row.supplierId as string | null | undefined,
      categoryId: row.categoryId as string | null | undefined,
      transactionId: row.transactionId as string | null | undefined,
      amountCents: Number(row.actualAmountCents ?? row.varianceAmountCents ?? 0),
    })
    return candidate === dedupeKey
  })

  if (match) {
    const currentStatus = normalizeCostGuardAlertStatus(String((match as Record<string, unknown>).status ?? "new"))
    if (currentStatus !== record.status) {
      const updated = await tx.costGuardAlert.update({
        where: { id: String(match.id) },
        data: { status: record.status },
      })
      return updated
    }
    return match
  }

  const created = await tx.costGuardAlert.create({
    data: record,
  })

  return created
}

export function buildCostGuardAlertEventRecord(input: CostGuardAlertEventRecordInput) {
  return {
    userId: input.userId,
    alertId: input.alertId,
    eventType: buildCostGuardAlertEventTypeForStatus(input.status),
    actorId: input.actorId ?? null,
    reason: input.reason ?? null,
    metadata: input.metadata ?? null,
  }
}

export interface CostGuardRuleChangeEventRecordInput {
  userId: string
  ruleId: string
  action: "create" | "update"
  actorId?: string | null
  reason?: string | null
  previous?: Record<string, unknown> | null
  next?: Record<string, unknown> | null
}

export interface CostGuardNotificationPlan {
  immediate: Array<{ id: string; severity: "critical" | "warning" | "watch" | "info"; title: string; description: string }>
  daily: Array<{ id: string; severity: "critical" | "warning" | "watch" | "info"; title: string; description: string }>
  weekly: Array<{ id: string; severity: "critical" | "warning" | "watch" | "info"; title: string; description: string }>
}

export interface RecurringSpendBaselineSummary {
  recurringFindingCount: number
  currentMonthlyCents: number
  averageMonthlyCents: number
  annualizedCents: number
  sourceNotes: string[]
}

export interface CostGuardDigestSummaryInput {
  alerts: Array<{
    id: string
    title: string
    description: string
    severity: "critical" | "warning" | "watch" | "info"
    status: string
  }>
  period: "daily" | "weekly"
  userName?: string
}

export interface CostGuardDigestSummary {
  period: "daily" | "weekly"
  count: number
  headline: string
  items: Array<{ id: string; title: string; description: string; severity: string }>
}

export function buildCostGuardRuleChangeEventRecord(input: CostGuardRuleChangeEventRecordInput) {
  const previous = input.previous ?? null
  const next = input.next ?? null
  const metadata = {
    ruleId: input.ruleId,
    action: input.action,
    before: previous,
    after: next,
  }

  return {
    userId: input.userId,
    alertId: input.ruleId,
    eventType: COST_GUARD_ALERT_EVENT_TYPES.RULE_CHANGED,
    actorId: input.actorId ?? null,
    reason: input.reason ?? `Cost Guard rule ${input.action}d`,
    metadata,
  }
}

export function buildCostGuardNotificationPlan(
  alerts: Array<{
    id: string
    severity: "critical" | "warning" | "watch" | "info"
    status: string
    title: string
    description: string
  }>,
): CostGuardNotificationPlan {
  const filtered = alerts.filter((alert) => {
    const status = normalizeCostGuardAlertStatus(alert.status)
    return status !== "acknowledged" && status !== "snoozed" && status !== "resolved" && status !== "ignored"
  })

  const immediate = filtered.filter((alert) => alert.severity === "critical")
  const daily = filtered.filter((alert) => alert.severity === "warning")
  const weekly = filtered.filter((alert) => alert.severity === "watch" || alert.severity === "info")

  return {
    immediate: immediate.map((alert) => ({
      id: alert.id,
      severity: alert.severity,
      title: alert.title,
      description: alert.description,
    })),
    daily: daily.map((alert) => ({
      id: alert.id,
      severity: alert.severity,
      title: alert.title,
      description: alert.description,
    })),
    weekly: weekly.map((alert) => ({
      id: alert.id,
      severity: alert.severity,
      title: alert.title,
      description: alert.description,
    })),
  }
}

export function buildCostGuardDigestSummary(input: CostGuardDigestSummaryInput): CostGuardDigestSummary {
  const actionable = input.alerts.filter((alert) => {
    const status = normalizeCostGuardAlertStatus(alert.status)
    return status !== "acknowledged" && status !== "snoozed" && status !== "resolved" && status !== "ignored"
  })
  const count = actionable.length
  const label = input.userName ? `${input.userName}'s` : "Your"
  const headline = `${label} ${input.period} summary: ${count} ${count === 1 ? "item needs attention" : "items need attention"}.`

  return {
    period: input.period,
    count,
    headline,
    items: actionable.map((alert) => ({
      id: alert.id,
      title: alert.title,
      description: alert.description,
      severity: alert.severity,
    })),
  }
}

export function buildRecurringSpendBaselineFromSpendInsights(
  insights: Array<{
    findingType?: string | null
    estimatedMonthlyCents?: number | null
    estimatedAnnualCents?: number | null
    state?: string | null
  }>,
): RecurringSpendBaselineSummary {
  const recurring = insights.filter((insight) => {
    const status = (insight.state ?? "open").toLowerCase()
    return (insight.findingType ?? "") === "recurring_spend" && status !== "resolved" && status !== "dismissed" && status !== "snoozed"
  })

  const monthlyValues = recurring
    .map((insight) => Number(insight.estimatedMonthlyCents ?? 0))
    .filter((value) => Number.isFinite(value) && value > 0)

  const currentMonthlyCents = monthlyValues.reduce((sum, value) => sum + value, 0)
  const averageMonthlyCents = monthlyValues.length > 0 ? Math.round(currentMonthlyCents / monthlyValues.length) : 0
  const annualizedCents = currentMonthlyCents * 12

  return {
    recurringFindingCount: recurring.length,
    currentMonthlyCents,
    averageMonthlyCents,
    annualizedCents,
    sourceNotes: recurring.map((insight) => insight.findingType ?? "recurring_spend"),
  }
}

export function buildRecurringCostBaselineInput({
  actualRecurringCents,
  spendInsights,
  percentageThreshold,
  absoluteThresholdCents,
}: {
  actualRecurringCents: number
  spendInsights: Array<{
    findingType?: string | null
    estimatedMonthlyCents?: number | null
    estimatedAnnualCents?: number | null
    state?: string | null
  }>
  percentageThreshold: number
  absoluteThresholdCents: number
}): RecurringCostInput {
  const baseline = buildRecurringSpendBaselineFromSpendInsights(spendInsights)
  return {
    currentRecurringCents: actualRecurringCents,
    baselineRecurringCents: baseline.currentMonthlyCents,
    percentageThreshold,
    absoluteThresholdCents,
  }
}

export function buildCostGuardAlertSummary(input: CostGuardAlertSummaryInput): CostGuardAlertSummary {
  const lifecycle = buildCostGuardAlertLifecycleSummary(input.status)
  const detectedAt = input.detectedAt instanceof Date ? input.detectedAt.toISOString() : input.detectedAt

  return {
    id: input.id,
    userId: input.userId,
    alertType: input.alertType,
    severity: input.severity,
    title: input.title,
    description: input.description,
    baselineAmountCents: input.baselineAmountCents,
    actualAmountCents: input.actualAmountCents,
    varianceAmountCents: input.varianceAmountCents,
    variancePercent: input.variancePercent,
    confidence: Math.max(0, Math.min(100, input.confidence)),
    status: lifecycle.status,
    detectedAt,
    lifecycle,
    message: `${input.title} — ${input.description}`,
  }
}

export function calculateBaseline(values: number[]): BaselineCalculation {
  const sorted = [...values].sort((a, b) => a - b)
  const averageCents = values.length > 0 ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0
  const medianCents =
    sorted.length === 0
      ? 0
      : sorted.length % 2 === 0
        ? Math.round((sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2)
        : sorted[Math.floor(sorted.length / 2)]

  const minCents = sorted.length > 0 ? sorted[0] : 0
  const maxCents = sorted.length > 0 ? sorted[sorted.length - 1] : 0
  const variance = values.length > 0 ? values.reduce((sum, value) => sum + (value - averageCents) ** 2, 0) / values.length : 0
  const stdDev = Math.sqrt(variance)
  const spreadRatio = maxCents > 0 ? (maxCents - minCents) / maxCents : 0
  const sampleStrength = Math.min(1, values.length / 12)
  const consistencyScore = Math.max(0, 1 - Math.min(1, stdDev / Math.max(averageCents, 1)))
  const confidence = Math.round((sampleStrength * 0.55 + consistencyScore * 0.45 + (1 - Math.min(1, spreadRatio)) * 0.2) * 100)

  return {
    sampleCount: values.length,
    averageCents,
    medianCents,
    confidence: Math.min(100, Math.max(0, confidence)),
    minCents,
    maxCents,
  }
}

export function evaluateMateriality({
  actualCents,
  baselineCents,
  percentageThreshold,
  absoluteThresholdCents,
}: MaterialityInput): MaterialityEvaluation {
  const varianceAmountCents = actualCents - baselineCents
  const variancePercent = baselineCents === 0 ? (actualCents === 0 ? 0 : 100) : (varianceAmountCents / baselineCents) * 100
  const passes = Math.abs(variancePercent) >= percentageThreshold && Math.abs(varianceAmountCents) >= absoluteThresholdCents

  return {
    varianceAmountCents,
    variancePercent,
    passes,
  }
}

export function detectSupplierIncrease(input: DriftDetectionInput): DriftDetectionResult {
  const evaluation = evaluateMateriality(input)
  const confidence = Math.min(
    100,
    Math.max(50, Math.round(Math.abs(evaluation.variancePercent) * 1.2 + Math.abs(evaluation.varianceAmountCents) / 1000)),
  )

  return {
    triggered: evaluation.passes,
    varianceAmountCents: evaluation.varianceAmountCents,
    variancePercent: evaluation.variancePercent,
    confidence,
    reason: evaluation.passes
      ? `material supplier increase detected: ${Math.abs(evaluation.variancePercent).toFixed(1)}% above baseline and ${Math.abs(evaluation.varianceAmountCents) / 100} AUD beyond the normal range.`
      : "Supplier spend is below the materiality threshold for an alert.",
  }
}

export function detectCategoryIncrease(input: DriftDetectionInput): DriftDetectionResult {
  const evaluation = evaluateMateriality(input)
  const confidence = Math.min(
    100,
    Math.max(50, Math.round(Math.abs(evaluation.variancePercent) * 1.1 + Math.abs(evaluation.varianceAmountCents) / 1200)),
  )

  return {
    triggered: evaluation.passes,
    varianceAmountCents: evaluation.varianceAmountCents,
    variancePercent: evaluation.variancePercent,
    confidence,
    reason: evaluation.passes
      ? `material category increase detected: ${Math.abs(evaluation.variancePercent).toFixed(1)}% above baseline and ${Math.abs(evaluation.varianceAmountCents) / 100} AUD beyond the expected category spend.`
      : "Category spend remains within the configured materiality threshold.",
  }
}

export function detectSpendVelocity(input: SpendVelocityInput): DriftDetectionResult {
  const evaluation = evaluateMateriality({
    actualCents: input.currentMonthToDateCents,
    baselineCents: input.baselineMonthToDateCents,
    percentageThreshold: input.percentageThreshold,
    absoluteThresholdCents: input.absoluteThresholdCents,
  })
  const confidence = Math.min(
    100,
    Math.max(55, Math.round(Math.abs(evaluation.variancePercent) * 1.25 + Math.abs(evaluation.varianceAmountCents) / 1500)),
  )

  return {
    triggered: evaluation.passes,
    varianceAmountCents: evaluation.varianceAmountCents,
    variancePercent: evaluation.variancePercent,
    confidence,
    reason: evaluation.passes
      ? `material spend velocity above the normal month-to-date pace: ${Math.abs(evaluation.variancePercent).toFixed(1)}% higher and ${Math.abs(evaluation.varianceAmountCents) / 100} AUD above the expected run rate.`
      : "Spend velocity remains in line with the expected monthly pattern.",
  }
}

export function detectDuplicateSpend(input: DuplicateSpendInput): DriftDetectionResult {
  const varianceAmountCents = input.currentAmountCents - input.baselineCents
  const triggered = input.duplicateReferenceCount > 1 && Math.abs(varianceAmountCents) >= input.thresholdCents

  return {
    triggered,
    varianceAmountCents,
    variancePercent: input.baselineCents === 0 ? 0 : (varianceAmountCents / input.baselineCents) * 100,
    confidence: triggered ? 90 : 0,
    reason: triggered
      ? `duplicate spend detected across ${input.duplicateReferenceCount} matching references with ${Math.abs(varianceAmountCents) / 100} AUD variance.`
      : "No duplicate spend signal crossed the configured threshold.",
  }
}

export function detectLargeUnusualInvoice(input: UnusualInvoiceInput): DriftDetectionResult {
  const evaluation = evaluateMateriality(input)

  return {
    triggered: evaluation.passes,
    varianceAmountCents: evaluation.varianceAmountCents,
    variancePercent: evaluation.variancePercent,
    confidence: evaluation.passes ? 88 : 0,
    reason: evaluation.passes
      ? `unusual invoice detected: ${Math.abs(evaluation.variancePercent).toFixed(1)}% above the supplier's normal range and ${Math.abs(evaluation.varianceAmountCents) / 100} AUD above expectation.`
      : "Invoice size remains within the unusual-invoice threshold.",
  }
}

export function detectNewSupplier(input: NewSupplierInput): DriftDetectionResult {
  const varianceAmountCents = input.actualCents - input.historicalCents
  const triggered = input.actualCents >= input.thresholdCents && input.historicalCents === 0

  return {
    triggered,
    varianceAmountCents,
    variancePercent: input.historicalCents === 0 && input.actualCents > 0 ? 100 : 0,
    confidence: triggered ? 80 : 0,
    reason: triggered
      ? `new supplier created a material spend event at ${Math.round(input.actualCents / 100)} AUD with no historical baseline.`
      : "New supplier activity remains below the configured threshold.",
  }
}

export function detectRecurringCostIncrease(input: RecurringCostInput): DriftDetectionResult {
  const evaluation = evaluateMateriality({
    actualCents: input.currentRecurringCents,
    baselineCents: input.baselineRecurringCents,
    percentageThreshold: input.percentageThreshold,
    absoluteThresholdCents: input.absoluteThresholdCents,
  })

  return {
    triggered: evaluation.passes,
    varianceAmountCents: evaluation.varianceAmountCents,
    variancePercent: evaluation.variancePercent,
    confidence: evaluation.passes ? 87 : 0,
    reason: evaluation.passes
      ? `recurring cost increase detected: ${Math.abs(evaluation.variancePercent).toFixed(1)}% above baseline and ${Math.abs(evaluation.varianceAmountCents) / 100} AUD over the recurring spend expectation.`
      : "Recurring commitments remain within the expected change threshold.",
  }
}

export function calculateForecast({
  actualSpendCents,
  recurringCommitmentsCents,
  expectedVariableSpendCents,
  baselineSpendCents = 0,
}: ForecastInput): ForecastSummary {
  const projectedMonthEndCents =
    actualSpendCents + recurringCommitmentsCents + expectedVariableSpendCents
  const varianceAmountCents = projectedMonthEndCents - baselineSpendCents
  const variancePercent = baselineSpendCents === 0 ? 0 : (varianceAmountCents / baselineSpendCents) * 100
  const confidence = Math.max(
    0,
    Math.min(100, Math.round(100 - Math.min(100, Math.abs(variancePercent) / 2)))
  )

  return {
    actualSpendCents,
    recurringCommitmentsCents,
    expectedVariableSpendCents,
    projectedMonthEndCents,
    varianceAmountCents,
    variancePercent,
    confidence,
  }
}

export function buildCostGuardForecastSummary(forecast: ForecastSummary): CostGuardForecastSummary {
  const absVariance = Math.abs(forecast.varianceAmountCents)
  const absPercent = Math.abs(forecast.variancePercent)

  let status: CostGuardForecastSummary["status"] = "on_track"
  let message = "Projected spend remains within the expected range."

  if (absVariance > 25000 || absPercent > 15) {
    status = "over_target"
    message = `Projected month-end spend is ${absVariance >= 0 ? "above" : "below"} the expected baseline by ${Math.abs(forecast.varianceAmountCents) / 100} AUD, which is ${Math.abs(forecast.variancePercent).toFixed(1)}% away from plan.`
  } else if (absVariance > 10000 || absPercent > 5) {
    status = "watch"
    message = `Projected month-end spend is close to the expected range and should be reviewed.`
  }

  return {
    projectedMonthEndCents: forecast.projectedMonthEndCents,
    varianceAmountCents: forecast.varianceAmountCents,
    variancePercent: forecast.variancePercent,
    confidence: forecast.confidence,
    status,
    message,
  }
}

export function shouldApplyCostGuardRule(
  rule: Pick<CostGuardRuleDefinition, "enabled" | "supplierId" | "categoryId" | "ruleType"> & {
    supplierId?: string | null
    categoryId?: string | null
  },
  context: { supplierId?: string | null; categoryId?: string | null } = {},
): boolean {
  if (!rule.enabled) {
    return false
  }

  if (rule.supplierId && context.supplierId && rule.supplierId !== context.supplierId) {
    return false
  }

  if (rule.categoryId && context.categoryId && rule.categoryId !== context.categoryId) {
    return false
  }

  return true
}

export function getCostGuardRulePriority(
  rule: Pick<
    CostGuardRuleDefinition,
    "enabled" | "severity" | "supplierId" | "categoryId" | "percentageThreshold" | "absoluteThresholdCents"
  >,
): number {
  const severityWeight = { info: 1, watch: 2, warning: 3, critical: 4 }
  const specificityWeight = Number(Boolean(rule.supplierId)) + Number(Boolean(rule.categoryId))
  const thresholdWeight = Math.min(20, Math.round((rule.percentageThreshold ?? 0) / 2) + Math.round((rule.absoluteThresholdCents ?? 0) / 20000))

  return (rule.enabled ? 100 : 0) + (severityWeight[rule.severity] ?? 0) * 10 + specificityWeight * 10 + thresholdWeight
}

export function resolveCostGuardRuleConflict<T extends Pick<
  CostGuardRuleDefinition,
  "enabled" | "severity" | "supplierId" | "categoryId" | "percentageThreshold" | "absoluteThresholdCents"
>>(rules: T[], context: { supplierId?: string | null; categoryId?: string | null } = {}): T | null {
  const applicable = rules.filter((rule) => shouldApplyCostGuardRule(rule as any, context))
  if (applicable.length === 0) {
    return null
  }

  return applicable.reduce((winner, candidate) => {
    return getCostGuardRulePriority(candidate) > getCostGuardRulePriority(winner) ? candidate : winner
  }, applicable[0])
}

export function buildDefaultCostGuardRules(): CostGuardRuleDefinition[] {
  return [
    {
      id: "supplier-increase-default",
      name: "Supplier increase",
      ruleType: "supplier_increase",
      severity: "warning",
      defaultPercentageThreshold: 20,
      defaultAbsoluteThresholdCents: 10000,
      enabled: true,
      description: "Alert when a supplier's spend exceeds the recent baseline by a material amount.",
    },
    {
      id: "category-increase-default",
      name: "Category increase",
      ruleType: "category_increase",
      severity: "warning",
      defaultPercentageThreshold: 25,
      defaultAbsoluteThresholdCents: 15000,
      enabled: true,
      description: "Alert when a category is trending materially above its recent baseline.",
    },
    {
      id: "large-unusual-invoice-default",
      name: "Large unusual invoice",
      ruleType: "large_unusual_invoice",
      severity: "critical",
      defaultPercentageThreshold: 50,
      defaultAbsoluteThresholdCents: 25000,
      enabled: true,
      description: "Alert when an invoice is abnormally large compared with the supplier's recent range.",
    },
    {
      id: "duplicate-spend-default",
      name: "Duplicate or suspicious spend",
      ruleType: "duplicate_spend",
      severity: "warning",
      defaultPercentageThreshold: 0,
      defaultAbsoluteThresholdCents: 5000,
      enabled: true,
      description: "Alert on suspected duplicate invoices or duplicated transaction references.",
    },
    {
      id: "new-supplier-default",
      name: "New supplier",
      ruleType: "new_supplier",
      severity: "info",
      defaultPercentageThreshold: 0,
      defaultAbsoluteThresholdCents: 20000,
      enabled: true,
      description: "Alert when a new supplier creates large or unusual spend with no prior baseline.",
    },
    {
      id: "recurring-increase-default",
      name: "Recurring increase",
      ruleType: "recurring_increase",
      severity: "warning",
      defaultPercentageThreshold: 15,
      defaultAbsoluteThresholdCents: 5000,
      enabled: true,
      description: "Alert when recurring commitments increase above the expected spend baseline.",
    },
    {
      id: "forecast-overrun-default",
      name: "Forecast overrun",
      ruleType: "forecast_overrun",
      severity: "critical",
      defaultPercentageThreshold: 10,
      defaultAbsoluteThresholdCents: 20000,
      enabled: true,
      description: "Alert when the projected month-end spend is materially above the expected range.",
    },
  ]
}
