import { before, beforeEach, describe, mock, test } from "node:test"
import assert from "node:assert/strict"

import {
  BASELINE_WINDOWS,
  COST_GUARD_ALERT_EVENT_TYPES,
  type CostGuardAlertRecordInput,
  buildCostGuardAlertEventRecord,
  buildCostGuardAlertEventTypeForStatus,
  buildCostGuardAlertLifecycleSummary,
  buildCostGuardAlertRecord,
  buildCostGuardRuleChangeEventRecord,
  buildCostGuardAlertSummary,
  buildCostGuardDigestSummary,
  buildCostGuardNotificationPlan,
  buildCostGuardForecastSummary,
  buildDefaultCostGuardRules,
  buildRecurringSpendBaselineFromSpendInsights,
  calculateBaseline,
  calculateForecast,
  canTransitionCostGuardAlertStatus,
  createCostGuardAlertDeduplicationKey,
  upsertCostGuardAlertRecord,
  detectCategoryIncrease,
  detectDuplicateSpend,
  detectLargeUnusualInvoice,
  detectNewSupplier,
  detectRecurringCostIncrease,
  detectSpendVelocity,
  detectSupplierIncrease,
  evaluateMateriality,
  normalizeCostGuardAlertStatus,
  resolveCostGuardRuleConflict,
  shouldApplyCostGuardRule,
} from "@/lib/costGuard/foundation"

test("baseline calculation stores both average and median values", () => {
  const baseline = calculateBaseline([10000, 12000, 11000, 20000, 9000])

  assert.equal(baseline.sampleCount, 5)
  assert.equal(baseline.averageCents, 12400)
  assert.equal(baseline.medianCents, 11000)
  assert.ok(baseline.confidence > 0)
})

test("materiality evaluation requires both percentage and dollar thresholds", () => {
  const result = evaluateMateriality({
    actualCents: 25000,
    baselineCents: 18000,
    percentageThreshold: 20,
    absoluteThresholdCents: 5000,
  })

  assert.equal(result.varianceAmountCents, 7000)
  assert.ok(Math.abs(result.variancePercent) >= 20)
  assert.equal(result.passes, true)

  const lowDollarResult = evaluateMateriality({
    actualCents: 19000,
    baselineCents: 18000,
    percentageThreshold: 20,
    absoluteThresholdCents: 5000,
  })

  assert.equal(lowDollarResult.passes, false)
})

test("month-end forecast combines spend-to-date with commitments and expected remaining variable spend", () => {
  const forecast = calculateForecast({
    actualSpendCents: 150000,
    recurringCommitmentsCents: 40000,
    expectedVariableSpendCents: 30000,
    baselineSpendCents: 180000,
  })

  assert.equal(forecast.projectedMonthEndCents, 220000)
  assert.equal(forecast.varianceAmountCents, 40000)
  assert.ok(forecast.variancePercent > 0)
  assert.ok(forecast.confidence > 0)
})

test("forecast summary exposes the risk state expected by the dashboard", () => {
  const summary = buildCostGuardForecastSummary(
    calculateForecast({
      actualSpendCents: 150000,
      recurringCommitmentsCents: 40000,
      expectedVariableSpendCents: 30000,
      baselineSpendCents: 180000,
    }),
  )

  assert.equal(summary.projectedMonthEndCents, 220000)
  assert.equal(summary.varianceAmountCents, 40000)
  assert.equal(summary.status, "over_target")
  assert.ok(summary.message.includes("above"))
})

test("supplier, category, and velocity detectors trigger only on material drift", () => {
  const supplier = detectSupplierIncrease({
    actualCents: 180000,
    baselineCents: 120000,
    percentageThreshold: 20,
    absoluteThresholdCents: 10000,
  })
  const category = detectCategoryIncrease({
    actualCents: 160000,
    baselineCents: 100000,
    percentageThreshold: 25,
    absoluteThresholdCents: 15000,
  })
  const velocity = detectSpendVelocity({
    currentMonthToDateCents: 220000,
    baselineMonthToDateCents: 150000,
    percentageThreshold: 15,
    absoluteThresholdCents: 20000,
  })

  assert.equal(supplier.triggered, true)
  assert.equal(category.triggered, true)
  assert.equal(velocity.triggered, true)
  assert.ok(supplier.reason.includes("material"))
  assert.ok(velocity.confidence >= 50)
})

test("remaining signal detectors catch duplicate, unusual, new supplier, and recurring increases", () => {
  const duplicate = detectDuplicateSpend({
    currentAmountCents: 35000,
    baselineCents: 10000,
    thresholdCents: 20000,
    duplicateReferenceCount: 2,
  })
  const unusual = detectLargeUnusualInvoice({
    actualCents: 90000,
    baselineCents: 22000,
    percentageThreshold: 50,
    absoluteThresholdCents: 25000,
  })
  const newSupplier = detectNewSupplier({
    actualCents: 60000,
    historicalCents: 0,
    thresholdCents: 20000,
  })
  const recurring = detectRecurringCostIncrease({
    currentRecurringCents: 120000,
    baselineRecurringCents: 90000,
    percentageThreshold: 15,
    absoluteThresholdCents: 5000,
  })

  assert.equal(duplicate.triggered, true)
  assert.equal(unusual.triggered, true)
  assert.equal(newSupplier.triggered, true)
  assert.equal(recurring.triggered, true)
  assert.ok(duplicate.reason.toLowerCase().includes("duplicate"))
  assert.ok(unusual.reason.toLowerCase().includes("unusual"))
})

test("cost guard lifecycle and deduplication stay stable across repeated syncs", () => {
  assert.equal(normalizeCostGuardAlertStatus("ACKNOWLEDGED"), "acknowledged")
  assert.equal(canTransitionCostGuardAlertStatus("new", "acknowledged"), true)
  assert.equal(canTransitionCostGuardAlertStatus("new", "resolved"), false)

  const dedupeA = createCostGuardAlertDeduplicationKey({
    userId: "user-123",
    alertType: "supplier_increase",
    supplierId: "supplier-1",
    transactionId: "txn-1",
  })
  const dedupeB = createCostGuardAlertDeduplicationKey({
    userId: "user-123",
    alertType: "supplier_increase",
    supplierId: "supplier-1",
    transactionId: "txn-1",
  })

  assert.equal(dedupeA, dedupeB)
  assert.ok(dedupeA.includes("supplier_increase"))
})

test("alert lifecycle events and default rules cover the required guardrail states", () => {
  const rules = buildDefaultCostGuardRules()
  const summary = buildCostGuardAlertLifecycleSummary("ACKNOWLEDGED")

  assert.equal(buildCostGuardAlertEventTypeForStatus("new"), COST_GUARD_ALERT_EVENT_TYPES.CREATED)
  assert.equal(buildCostGuardAlertEventTypeForStatus("acknowledged"), COST_GUARD_ALERT_EVENT_TYPES.ACKNOWLEDGED)
  assert.equal(buildCostGuardAlertEventTypeForStatus("resolved"), COST_GUARD_ALERT_EVENT_TYPES.RESOLVED)
  assert.equal(summary.status, "acknowledged")
  assert.equal(summary.label, "Acknowledged")
  assert.equal(summary.isTerminal, false)
  assert.deepEqual(BASELINE_WINDOWS, [3, 6, 12])
  assert.ok(rules.some((rule) => rule.ruleType === "supplier_increase"))
  assert.ok(rules.some((rule) => rule.ruleType === "category_increase"))
  assert.ok(rules.some((rule) => rule.ruleType === "forecast_overrun"))
  assert.ok(rules.length >= 7)
})

test("rule scoping allows noisy supplier or category exclusions without disabling the whole rule family", () => {
  const supplierRule = {
    enabled: true,
    ruleType: "supplier_increase",
    supplierId: "supplier-1",
    categoryId: null,
  }
  const categoryRule = {
    enabled: true,
    ruleType: "category_increase",
    supplierId: null,
    categoryId: "category-1",
  }

  assert.equal(shouldApplyCostGuardRule(supplierRule, { supplierId: "supplier-1" }), true)
  assert.equal(shouldApplyCostGuardRule(supplierRule, { supplierId: "supplier-2" }), false)
  assert.equal(shouldApplyCostGuardRule(categoryRule, { categoryId: "category-1" }), true)
  assert.equal(shouldApplyCostGuardRule(categoryRule, { categoryId: "category-2" }), false)
  assert.equal(shouldApplyCostGuardRule({ ...supplierRule, enabled: false }, { supplierId: "supplier-1" }), false)
})

test("rule precedence resolves the most specific, highest-priority active rule when multiple rules conflict", () => {
  const generalWarning = {
    enabled: true,
    severity: "warning" as const,
    supplierId: null,
    categoryId: null,
    percentageThreshold: 20,
    absoluteThresholdCents: 10000,
  }
  const supplierCritical = {
    enabled: true,
    severity: "critical" as const,
    supplierId: "supplier-1",
    categoryId: null,
    percentageThreshold: 25,
    absoluteThresholdCents: 20000,
  }
  const disabledFallback = {
    enabled: false,
    severity: "watch" as const,
    supplierId: "supplier-1",
    categoryId: null,
    percentageThreshold: 10,
    absoluteThresholdCents: 5000,
  }

  const selected = resolveCostGuardRuleConflict([generalWarning, supplierCritical, disabledFallback], {
    supplierId: "supplier-1",
  })

  assert.ok(selected)
  assert.equal(selected.severity, "critical")
  assert.equal(selected.supplierId, "supplier-1")
  assert.equal(resolveCostGuardRuleConflict([generalWarning], { supplierId: "supplier-2" })?.severity, "warning")
})
test("alert records and rule change events use the schema contract for persistence", () => {
  const alert = buildCostGuardAlertRecord({
    userId: "user-123",
    alertType: "supplier_increase",
    supplierId: "supplier-4",
    categoryId: "category-2",
    transactionId: "txn-9",
    severity: "warning",
    title: "Supplier cost up materially",
    description: "Supplier spend exceeded the baseline range.",
    baselineAmountCents: 120000,
    actualAmountCents: 180000,
    varianceAmountCents: 60000,
    variancePercent: 50,
    confidence: 83,
    status: "new",
  })

  const event = buildCostGuardAlertEventRecord({
    userId: "user-123",
    alertId: "alert-1",
    status: "acknowledged",
    actorId: "owner-1",
    reason: "Owner reviewed the supplier drift.",
    metadata: { supplierId: "supplier-4" },
  })

  const ruleEvent = buildCostGuardRuleChangeEventRecord({
    userId: "user-123",
    ruleId: "rule-22",
    action: "update",
    actorId: "owner-1",
    reason: "Adjusted supplier threshold",
    previous: { percentageThreshold: 20 },
    next: { percentageThreshold: 25 },
  })

  assert.equal(alert.alertType, "supplier_increase")
  assert.equal(alert.status, "new")
  assert.equal(alert.confidence, 83)
  assert.equal(event.eventType, COST_GUARD_ALERT_EVENT_TYPES.ACKNOWLEDGED)
  assert.equal(event.reason, "Owner reviewed the supplier drift.")
  assert.equal(ruleEvent.eventType, COST_GUARD_ALERT_EVENT_TYPES.RULE_CHANGED)
  assert.equal(ruleEvent.metadata.ruleId, "rule-22")
  assert.equal(ruleEvent.metadata.action, "update")
  const after = (ruleEvent.metadata.after ?? null) as { percentageThreshold?: number } | null
  assert.equal(after?.percentageThreshold, 25)
})

test("alert summaries expose a safe API contract for list and detail views", () => {
  const summary = buildCostGuardAlertSummary({
    id: "alert-7",
    userId: "user-123",
    alertType: "supplier_increase",
    severity: "warning",
    title: "Supplier cost moved materially",
    description: "Supplier spend exceeded the expected range.",
    baselineAmountCents: 120000,
    actualAmountCents: 180000,
    varianceAmountCents: 60000,
    variancePercent: 50,
    confidence: 82,
    status: "acknowledged",
    detectedAt: "2026-09-01T00:00:00.000Z",
  })

  assert.equal(summary.id, "alert-7")
  assert.equal(summary.status, "acknowledged")
  assert.equal(summary.lifecycle.label, "Acknowledged")
  assert.equal(summary.variancePercent, 50)
  assert.ok(summary.message.includes("Supplier cost moved materially"))
})

test("SpendLeak recurring spend findings become the recurring baseline for cost guard forecasts", () => {
  const spendInsights: Parameters<typeof buildRecurringSpendBaselineFromSpendInsights>[0] = [
    {
      findingType: "recurring_spend",
      estimatedMonthlyCents: 120000,
      estimatedAnnualCents: 1440000,
      state: "open",
    },
    {
      findingType: "recurring_spend",
      estimatedMonthlyCents: 180000,
      estimatedAnnualCents: 2160000,
      state: "open",
    },
    {
      findingType: "duplicate_spend",
      estimatedMonthlyCents: 50000,
      estimatedAnnualCents: 600000,
      state: "open",
    },
  ]

  const baseline = buildRecurringSpendBaselineFromSpendInsights(spendInsights)
  const recurringRisk = detectRecurringCostIncrease({
    currentRecurringCents: 350000,
    baselineRecurringCents: baseline.currentMonthlyCents,
    percentageThreshold: 15,
    absoluteThresholdCents: 15000,
  })

  assert.equal(baseline.recurringFindingCount, 2)
  assert.equal(baseline.currentMonthlyCents, 300000)
  assert.equal(baseline.averageMonthlyCents, 150000)
  assert.equal(baseline.annualizedCents, 3600000)
  assert.equal(recurringRisk.triggered, true)
  assert.ok(recurringRisk.reason.includes("recurring cost increase"))
})

test("critical alerts are sent immediately while warning and watch alerts are grouped into digest buckets", () => {
  const alerts: Array<{
    id: string
    alertType: string
    severity: "critical" | "warning" | "watch" | "info"
    status: string
    title: string
    description: string
    varianceAmountCents: number
    variancePercent: number
  }> = [
    {
      id: "alert-critical",
      alertType: "forecast_overrun",
      severity: "critical",
      status: "new",
      title: "Forecast raced past plan",
      description: "Projected month-end spend is above plan.",
      varianceAmountCents: 500000,
      variancePercent: 22,
    },
    {
      id: "alert-warning",
      alertType: "supplier_increase",
      severity: "warning",
      status: "new",
      title: "Supplier drift",
      description: "A supplier moved materially above baseline.",
      varianceAmountCents: 25000,
      variancePercent: 30,
    },
    {
      id: "alert-watch",
      alertType: "category_increase",
      severity: "watch",
      status: "snoozed",
      title: "Category drift",
      description: "Category is trending upward.",
      varianceAmountCents: 10000,
      variancePercent: 12,
    },
    {
      id: "alert-acknowledged",
      alertType: "new_supplier",
      severity: "watch",
      status: "acknowledged",
      title: "New supplier activity",
      description: "A new supplier is spending above threshold.",
      varianceAmountCents: 12000,
      variancePercent: 14,
    },
  ]

  const plan = buildCostGuardNotificationPlan(alerts)

  assert.equal(plan.immediate.length, 1)
  assert.equal(plan.immediate[0].id, "alert-critical")
  assert.equal(plan.daily.length, 1)
  assert.equal(plan.daily[0].id, "alert-warning")
  assert.equal(plan.weekly.length, 0)

  const digest = buildCostGuardDigestSummary({
    alerts: alerts.slice(0, 2),
    period: "daily",
    userName: "Taylor",
  })

  assert.equal(digest.period, "daily")
  assert.equal(digest.count, 2)
  assert.ok(digest.headline.includes("Taylor"))
  assert.ok(digest.headline.includes("2"))
})

test("repeated syncs reuse the same alert record for the same supplier drift signal", async () => {
  type AlertRow = {
    id: string
    userId: string
    alertType: string
    supplierId: string | null
    categoryId: string | null
    transactionId: string | null
    actualAmountCents: number
    varianceAmountCents: number
    status: string
  }

  type AlertTx = Parameters<typeof upsertCostGuardAlertRecord>[0]["tx"]

  const alerts: AlertRow[] = []
  const tx = {
    costGuardAlert: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        return alerts.find((alert) => {
          const sameUser = alert.userId === where.userId
          const sameType = alert.alertType === where.alertType
          return sameUser && sameType
        }) ?? null
      },
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        return alerts.filter((alert) => {
          const sameUser = alert.userId === where.userId
          const sameType = alert.alertType === where.alertType
          return sameUser && sameType
        })
      },
      create: async ({ data }: { data: CostGuardAlertRecordInput }) => {
        const row: AlertRow = {
          id: `alert-${alerts.length + 1}`,
          userId: data.userId,
          alertType: data.alertType,
          supplierId: data.supplierId ?? null,
          categoryId: data.categoryId ?? null,
          transactionId: data.transactionId ?? null,
          actualAmountCents: data.actualAmountCents,
          varianceAmountCents: data.varianceAmountCents,
          status: data.status ?? "new",
        }
        alerts.push(row)
        return row
      },
      update: async ({ where, data }: { where: { id: string }; data: { status: string } }) => {
        const row = alerts.find((alert) => alert.id === where.id)
        if (!row) throw new Error(`alert ${where.id} not found`)
        Object.assign(row, data)
        return row
      },
    },
  } as unknown as AlertTx

  const first = await upsertCostGuardAlertRecord({
    tx,
    input: {
      userId: "user-123",
      alertType: "supplier_increase",
      supplierId: "supplier-1",
      categoryId: null,
      transactionId: "txn-1",
      severity: "warning",
      title: "Supplier drift",
      description: "Spend moved materially above baseline.",
      baselineAmountCents: 120000,
      actualAmountCents: 180000,
      varianceAmountCents: 60000,
      variancePercent: 50,
      confidence: 84,
      status: "new",
    },
  })

  const second = await upsertCostGuardAlertRecord({
    tx,
    input: {
      userId: "user-123",
      alertType: "supplier_increase",
      supplierId: "supplier-1",
      categoryId: null,
      transactionId: "txn-1",
      severity: "warning",
      title: "Supplier drift",
      description: "Spend moved materially above baseline.",
      baselineAmountCents: 120000,
      actualAmountCents: 180000,
      varianceAmountCents: 60000,
      variancePercent: 50,
      confidence: 84,
      status: "new",
    },
  })

  assert.equal(first.id, "alert-1")
  assert.equal(second.id, "alert-1")
  assert.equal(alerts.length, 1)
})

describe("cost guard supplier and category routes", () => {
  let mockUser: { id: string } | null = { id: "user-123" }
  let supplierRows: Array<{ supplierName: string; _sum: { amountCents: number | null }; _count: { id: number } }> = [
    { supplierName: "Acme Pty Ltd", _sum: { amountCents: 25000 }, _count: { id: 3 } },
    { supplierName: "Northwind", _sum: { amountCents: 12000 }, _count: { id: 2 } },
  ]
  let categoryRows: Array<{ expenseAccountName: string | null; _sum: { amountCents: number | null }; _count: { id: number } }> = [
    { expenseAccountName: "Software", _sum: { amountCents: 40000 }, _count: { id: 4 } },
    { expenseAccountName: "Office", _sum: { amountCents: 15000 }, _count: { id: 2 } },
  ]

  let getSuppliers: (typeof import("@/app/api/cost-guard/suppliers/route"))["GET"]
  let getCategories: (typeof import("@/app/api/cost-guard/categories/route"))["GET"]

  before(async () => {
    await mock.module("@/lib/supabase/server", {
      namedExports: {
        createClient: async () => ({
          auth: { getUser: async () => ({ data: { user: mockUser } }) },
        }),
      },
    })

    await mock.module("@/lib/db/withUserContext", {
      namedExports: {
        withUserContext: async (
          _userId: string,
          fn: (tx: {
            importedBill: {
              groupBy: (args: { by: string[]; _sum: Record<string, boolean>; _count: Record<string, boolean> }) => Promise<Array<{ supplierName: string; _sum: { amountCents: number | null }; _count: { id: number } }> | Array<{ expenseAccountName: string | null; _sum: { amountCents: number | null }; _count: { id: number } }>>
            }
          }) => unknown,
        ) => {
          const tx = {
            importedBill: {
              groupBy: async ({ by, _sum, _count }: { by: string[]; _sum: Record<string, boolean>; _count: Record<string, boolean> }) => {
                if (by.includes("supplierName")) return supplierRows
                if (by.includes("expenseAccountName")) return categoryRows
                return []
              },
            },
          }
          return fn(tx)
        },
      },
    })

    ;({ GET: getSuppliers } = await import("@/app/api/cost-guard/suppliers/route"))
    ;({ GET: getCategories } = await import("@/app/api/cost-guard/categories/route"))
  })

  beforeEach(() => {
    mockUser = { id: "user-123" }
    supplierRows = [
      { supplierName: "Acme Pty Ltd", _sum: { amountCents: 25000 }, _count: { id: 3 } },
      { supplierName: "Northwind", _sum: { amountCents: 12000 }, _count: { id: 2 } },
    ]
    categoryRows = [
      { expenseAccountName: "Software", _sum: { amountCents: 40000 }, _count: { id: 4 } },
      { expenseAccountName: "Office", _sum: { amountCents: 15000 }, _count: { id: 2 } },
    ]
  })

  test("returns supplier totals for the current user", async () => {
    const res = await getSuppliers(new Request("http://localhost/api/cost-guard/suppliers?limit=10"))
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.deepEqual(body.suppliers[0], {
      id: "Acme Pty Ltd",
      supplierName: "Acme Pty Ltd",
      totalSpendCents: 25000,
      billCount: 3,
    })
  })

  test("returns category totals for the current user", async () => {
    const res = await getCategories(new Request("http://localhost/api/cost-guard/categories?limit=10"))
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.deepEqual(body.categories[0], {
      id: "Software",
      categoryName: "Software",
      totalSpendCents: 40000,
      billCount: 4,
    })
  })

  test("rejects unauthenticated requests", async () => {
    mockUser = null
    const res = await getSuppliers(new Request("http://localhost/api/cost-guard/suppliers"))
    assert.equal(res.status, 401)
  })
})
