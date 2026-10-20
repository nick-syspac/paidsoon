import assert from "node:assert/strict"
import { afterEach, before, beforeEach, describe, mock, test } from "node:test"
import { renderToStaticMarkup } from "react-dom/server"
import { formatCommitGuardMoney, presentCommitGuardSummary } from "@/lib/commitguard/summaryPresentation"
import { resolveEffectiveAccess } from "@/lib/billing/effectiveAccess"
import { COMMIT_GUARD_QUERY_MIGRATION_MESSAGE } from "@/lib/commitguard/summary"
import type { CommitmentSnapshot, CommitGuardSettingsSnapshot } from "@/lib/commitguard/types"
import type { CoverageRecord } from "@/lib/commitguard/coverage"

const now = new Date("2026-10-19T12:00:00Z")
const baseSettings: CommitGuardSettingsSnapshot & { calculationRevision: number } = {
  enabled: true, defaultHorizonDays: 30, calculationRevision: 9,
  safetyBufferMode: "fixed_amount", safetyBufferFixedCents: 0, safetyBufferCurrency: null,
  safetyBufferPercent: null, safetyBufferWeeks: null, detectRecurringCommitments: false,
  detectionMinOccurrences: 3, detectionAmountVariancePercent: 12, detectionIntervalToleranceDays: 3,
  detectionConfidenceThreshold: "medium", alertCommitmentDueSoon: true, alertRenewalApproaching: true,
  alertNoticePeriodApproaching: true, alertCommitmentAmountChanged: true,
  alertCommitmentBufferLow: true, alertCommitmentShortfall: true, renewalWarningDays: [90, 60, 30, 14, 7],
}
const baseCommitment: CommitmentSnapshot = {
  id: "commitment", userId: "tenant-a", name: "Synthetic", description: null,
  category: "software", amountCents: 1000, currency: "aud", frequency: "one_off",
  nextDueDate: new Date("2026-10-19Z"), startDate: null, endDate: null, recurrenceRule: null,
  supplierName: null, supplierId: null, accountId: null, source: "manual", status: "active",
  confidence: "confirmed", noticePeriodDays: null, renewalDate: null, autoRenew: false,
  cancellable: true, essentiality: "operational", notes: null, linkedSpendInsightId: null,
  linkedCostGuardAlertId: null, archivedAt: null, createdAt: now, updatedAt: now,
}
function seed() {
  return { settings: structuredClone(baseSettings) as typeof baseSettings | null,
    cash: { amountCents: 500000 as number | null, currency: "aud" as string | null,
      balanceAsOf: new Date("2026-10-12Z") as Date | null,
      weeklyOperatingExpensesCents: null as number | null, weeklyExpensesCurrency: null as string | null,
      weeklyExpensesAsOf: null as Date | null, taxProtectionCurrency: "aud", revision: 4 },
    commitments: [structuredClone(baseCommitment)], coverages: [] as CoverageRecord[],
    configuration: { enabled: true, accountingBasis: "cash" } as { enabled: boolean; accountingBasis: string } | null,
    categories: [{ id: "tax", userId: "tenant-a", enabled: true, categoryType: "custom", name: "Synthetic tax",
      calculationMethod: "manual", manualAmountCents: 12000, fixedAmountCents: null, ratePercent: null as number | null,
      updatedAt: now }],
  }
}
let state: ReturnType<typeof seed>
let transactions: number
let reads: string[]
let user: { id: string } | null
let authError: boolean
let core: boolean
let tax: boolean
let overviewTax: boolean
let subscription: boolean
let failRead: boolean
let service: typeof import("@/lib/commitguard/service")
let summaryRoute: typeof import("@/app/api/commitguard/summary/route")
let adapterRoute: typeof import("@/app/api/commitguard/cashplan/route")
let commitGuardPage: typeof import("@/app/dashboard/commitguard/page").default
let overviewPage: typeof import("@/app/dashboard/page").default
let digest: typeof import("@/lib/ownersDigest/service")
function own(args: { where: { userId: string } }): void { assert.equal(args.where.userId, "tenant-a") }
function link(amount = 1000, targetKind = "tax_reserve_category"): CoverageRecord {
  return { id: "coverage", userId: "tenant-a", commitmentId: "commitment", occurrenceDate: new Date("2026-10-19Z"),
    currency: "aud", coveredCents: amount, targetKind,
    importedBillId: targetKind === "imported_bill" ? "bill" : null,
    taxReserveCategoryId: targetKind === "tax_reserve_category" ? "tax" : null }
}

describe("summary v2 real read-only services and endpoints (offline)", () => {
  before(async () => {
    await mock.module("@/lib/db/withUserContext", { namedExports: {
      withUserContext: async (tenant: string, fn: (tx: object) => Promise<unknown>, options: unknown) => {
        assert.equal(tenant, "tenant-a")
        if (options !== undefined) assert.deepEqual(options, { isolationLevel: "RepeatableRead" })
        transactions++
        // Capture one snapshot. No mutation method exists on ANY delegate;
        // upsert/default/event/work/snapshot calls therefore fail these tests.
        const snapshot = structuredClone(state)
        const read = <T>(name: string, value: T) => async (args: { where: { userId: string } }): Promise<T> => {
          own(args); reads.push(name)
          if (failRead) throw new Error("private provider/database payload")
          return value
        }
        const result = await fn({
          commitGuardSetting: { findUnique: read("settings", snapshot.settings) },
          commitGuardCashContext: { findUnique: read("cash", snapshot.cash) },
          commitment: { findMany: read("commitments", snapshot.commitments) },
          commitmentCoverage: { findMany: read("coverage", snapshot.coverages) },
          taxBufferConfiguration: { findUnique: read("tax-config", snapshot.configuration) },
          taxReserveCategory: { findMany: read("categories", snapshot.categories) },
          taxBufferOverride: { findMany: read("overrides", []) },
          financialInvoice: { findMany: read("invoices", [
            { id: "invoice-aud", amountDueCents: 10000, currency: "aud", dueDate: now, syncedAt: now, sourceUpdatedAt: null },
            { id: "invoice-usd", amountDueCents: 10000, currency: "usd", dueDate: now, syncedAt: now, sourceUpdatedAt: null },
          ]) },
          importedBill: { findMany: read("bills", [{ id: "bill", userId: "tenant-a", amountCents: 10000,
            currency: "aud", status: "open", paidDate: null, rawSourceData: { AmountDue: 100 },
            accountingConnection: { userId: "tenant-a", provider: "xero" } }]) },
          taxBufferObligation: { findMany: read("attributions", []) },
          costGuardAlert: { findMany: async () => [] },
          taxBufferEvent: { findMany: async () => [] },
          cashPlan: { findFirst: async () => null },
          cashPlanSetting: { findFirst: async () => null },
        })
        assert.deepEqual(state, snapshot, "GET/service must not mutate saved state")
        return result
      },
    } })
    await mock.module("@/lib/supabase/server", { namedExports: {
      createClient: async () => ({ auth: { getUser: async () => ({ data: { user }, error: authError }) } }),
      getAuthenticatedUser: async () => ({ data: { user } }),
    } })
    await mock.module("@/lib/billing/effectiveAccessLoader", { namedExports: {
      getEffectiveAccess: async () => resolveEffectiveAccess({ profile: { subscriptionStatus: subscription ? "active" : "cancelled",
        subscriptionTier: "business_pro", stripeSubscriptionId: subscription ? "sub_synthetic" : null,
        trialEndsAt: null, billingAccessVersion: 1 }, grant: null, billingRisks: [] }, now),
    } })
    await mock.module("@/lib/billing", { namedExports: {
      getSubscriptionTier: async () => "small_business",
      getCommitmentLimitForTier: () => 100,
      getCommitmentDetectionCandidateLimitForTier: () => 100,
      requireFeature: async (_tenant: string, feature: string) =>
        feature === "commitguard_core" ? core : feature === "tax_buffer_basic" ? tax : false,
    } })
    await mock.module("@/lib/taxBuffer/service", { namedExports: {
      loadTaxBufferSummary: async () => {
        if (!overviewTax) throw new Error("legacy writing Tax Buffer summary forbidden")
        return { availableCashCents: 99999999, safeToSpendCents: 88888888,
          totalRequiredReserveCents: 0, totalReservedCents: 0, reserveGapCents: 0, healthStatus: "healthy",
          recommendation: { transferNowCents: 0 } }
      },
    } })
    await mock.module("next/navigation", { namedExports: {
      redirect: (url: string) => { throw new Error(`REDIRECT:${url}`) },
      useRouter: () => ({ refresh: () => {} }),
    } })
    await mock.module("next/headers", { namedExports: { headers: async () => new Headers() } })
    await mock.module("@/lib/diagnostics/server", { namedExports: {
      createServerTraceContext: () => ({}), traceEvent: () => {}, warnIfProductionDebugEnabled: () => {},
    } })
    // Isolate unrelated overview modules, not its CommitGuard service/renderer.
    for (const [name, exported] of [["spendleak", "canAccessSpendLeak"], ["ownersDigest", "canAccessOwnersDigest"],
      ["marginguard", "canAccessMarginGuard"], ["runwayGuard", "canAccessRunwayGuard"], ["taxBuffer", "canAccessTaxBuffer"]]) {
      await mock.module(`@/lib/dashboard/${name}Access`, { namedExports: { [exported]: () => name === "taxBuffer" && overviewTax } })
    }
    await mock.module("@/lib/dashboard/effectiveTier", { namedExports: { getDashboardEffectiveTier: () => "small_business" } })
    await mock.module("@/lib/dashboard/loadDashboardOverview", { namedExports: { loadDashboardOverview: async () => ({
      context: { profile: { displayName: "Synthetic" }, chaseAllowance: null }, activeInvoices: [],
      brokenPromiseCountsByDebtor: {}, escalationThreshold: 2,
      metrics: { paidInvoices: [], paidCountAllTime: 0, manuallyResolvedCountAllTime: 0, remindersSentToday: 0 },
      disputedInvoiceCount: 0, noContactEmailCustomerCount: 0, importAnomalyCount: 0,
    }) } })
    await mock.module("@/lib/commitguard/alertHistory", { namedExports: {
      listCommitGuardAlerts: async () => null, loadAlertCommitment: async () => null,
      listCommitGuardAlertsInTransaction: async () => ({ alerts: [], total: 0, page: 1, totalPages: 1, eventFound: true, evaluation: { available: false, lastEvaluatedAt: null } }),
      loadAlertCommitmentInTransaction: async () => null,
    } })
    await mock.module("@/lib/commitguard/detection", { namedExports: { listDetectedCommitmentCandidates: async () => [] } })
    for (const name of ["CommitGuardWorkspace", "CommitGuardCashContextPanel"]) {
      await mock.module(`@/components/dashboard/commitguard/${name}`, { namedExports: { [name]: () => null } })
    }
    for (const name of ["OverviewCards", "RecentPayments", "AttentionRequired", "ReminderActivityFunnel",
      "PaymentTrendChart", "CurrencySummarySection", "AiSummaryCard"]) {
      await mock.module(`@/components/dashboard/${name}`, { namedExports: { [name]: () => null } })
    }
    service = await import("@/lib/commitguard/service")
    summaryRoute = await import("@/app/api/commitguard/summary/route")
    adapterRoute = await import("@/app/api/commitguard/cashplan/route")
    commitGuardPage = (await import("@/app/dashboard/commitguard/page")).default
    overviewPage = (await import("@/app/dashboard/page")).default
    digest = await import("@/lib/ownersDigest/service")
  })
  beforeEach(() => {
    mock.timers.enable({ apis: ["Date"], now })
    state = seed(); transactions = 0; reads = []; user = { id: "tenant-a" }; authError = false
    core = true; tax = false; overviewTax = false; subscription = true; failRead = false
    mock.method(console, "error", () => {})
  })
  afterEach(() => mock.timers.reset())
  const summarize = () => service.summarizeCommitGuard({ userId: "tenant-a", now })

  test("7.1 overview Tax Buffer available cash never overrides saved CommitGuard gross cash", async () => {
    overviewTax = true
    const summary = await summarize()
    const html = renderToStaticMarkup(await overviewPage({ searchParams: Promise.resolve({}) }))
    const commitGuardSection = html.slice(html.indexOf("Saved cash and commitment protection"))
    assert.ok(commitGuardSection.includes(formatCommitGuardMoney(state.cash.amountCents, state.cash.currency)))
    assert.ok(commitGuardSection.includes(formatCommitGuardMoney(summary.freeCash.freeCashCents, summary.currency)))
    assert.equal(commitGuardSection.includes("999,999"), false)
    assert.equal(reads.includes("tax-config"), false, "canonical summary still independently checks Tax Buffer access")
    assert.equal(summary.cashContext.amountCents, 500000)
  })

  for (const mode of ["complete-usd", "missing", "stale", "zero", "negative", "mixed", "unsupported",
    "incomplete", "disabled", "precedence"] as const) {
    test(`7.1 actual page, overview renderer and Digest agree on the same saved revision: ${mode}`, async () => {
      state.cash.currency = "usd"; state.cash.amountCents = 500123
      state.cash.taxProtectionCurrency = "usd"; state.commitments[0].currency = "usd"
      state.settings!.defaultHorizonDays = 60
      state.commitments.push({ ...state.commitments[0], id: "day45", amountCents: 4321,
        confidence: "low", nextDueDate: new Date("2026-12-03Z") })
      if (mode === "missing") Object.assign(state.cash, { amountCents: null, currency: null, balanceAsOf: null })
      if (mode === "stale" || mode === "precedence") state.cash.balanceAsOf = new Date("2026-10-11Z")
      if (mode === "zero" || mode === "negative") {
        state.cash.amountCents = mode === "zero" ? 0 : -123; state.commitments = []
      }
      if (mode === "mixed" || mode === "unsupported" || mode === "precedence") {
        state.commitments.push({ ...state.commitments[0], id: "other-currency", currency: mode === "unsupported" ? "jpy" : "aud", confidence: "medium" })
      }
      if (mode === "incomplete") state.commitments[0].frequency = "custom"
      if (mode === "disabled") state.settings!.enabled = false
      if (mode === "precedence") {
        state.settings!.safetyBufferMode = "weeks_operating_expenses"; state.settings!.safetyBufferWeeks = 4
      }
      const saved = structuredClone(state)
      const summary = await summarize()
      const view = presentCommitGuardSummary(summary)
      const pageHtml = renderToStaticMarkup(await commitGuardPage({ searchParams: Promise.resolve({}) }))
      const overviewHtml = renderToStaticMarkup(await overviewPage({ searchParams: Promise.resolve({}) }))
      const provider = await digest.loadCommitGuardProvider("tenant-a", now)
      for (const html of [pageHtml, overviewHtml]) {
        assert.ok(html.includes(`data-input-revision="${summary.inputRevision}"`))
        assert.ok(html.includes(`data-calculation-revision="${summary.calculationRevision}"`))
        for (const value of [view.availableCash, view.committedNext30Days, view.protectedCash, view.freeCash,
          `Input quality: ${view.quality}`, `Safety status: ${view.status}`, "Owner-entered gross cash",
          "selected 60-day horizon", "Committed (next 30 days)", "Protected cash (60 days)"]) assert.ok(html.includes(value), value)
        for (const group of view.groups) for (const horizon of group.horizons) {
          for (const text of [`${group.currency.toUpperCase()} commitment horizons`, horizon.total,
            `Confirmed ${horizon.confirmed}`, `Probable ${horizon.probable}`, `Potential ${horizon.potential}`]) assert.ok(html.includes(text), text)
        }
        for (const reason of view.reasons) assert.ok(html.includes(reason.label), reason.label)
        if (summary.quality.state !== "complete") assert.doesNotMatch(html, /Safety status: (safe|watch|at risk|shortfall)/)
        assert.equal(html.includes("A$"), false)
      }
      const metrics = new Map(provider.metrics.map((metric) => [metric.key, metric]))
      assert.equal(metrics.get("free_cash")!.displayValue, view.freeCash)
      assert.equal(metrics.get("commitguard_protected_cash")!.displayValue, view.protectedCash)
      assert.equal(metrics.get("commitguard_available_cash")!.displayValue, view.availableCash)
      assert.ok(metrics.get("commitguard_quality")!.displayValue.includes(`Safety status: ${view.status}`))
      assert.equal(metrics.get("free_cash")!.metadata!.inputRevision, summary.inputRevision)
      assert.equal(metrics.get("free_cash")!.metadata!.calculationRevision, summary.calculationRevision)
      assert.deepEqual(metrics.get("free_cash")!.metadata!.sourceDates, summary.sourceDates)
      assert.deepEqual(metrics.get("free_cash")!.metadata!.quality, summary.quality)
      assert.equal(metrics.get("free_cash")!.metadata!.currency, summary.cashContext.currency)
      assert.equal(provider.dataAsOf!.toISOString(), summary.asOf)
      for (const group of view.groups) for (const horizon of group.horizons) {
        const metric = metrics.get(`commitguard_${group.currency}_${horizon.days}_days`)!
        assert.equal(metric.metadata!.currency, group.currency)
        for (const value of [horizon.total, `Confirmed ${horizon.confirmed}`, `Probable ${horizon.probable}`, `Potential ${horizon.potential}`]) assert.ok(metric.displayValue.includes(value))
      }
      assert.equal(tax, false, "owner cash never requires Tax Buffer entitlement")
      assert.equal(reads.includes("tax-config"), false)
      assert.deepEqual(state, saved, "every consumer remains read-only; records retained")
      if (summary.quality.state !== "complete") {
        assert.equal(metrics.get("free_cash")!.monetaryValueCents, null)
        assert.equal(metrics.get("commitguard_protected_cash")!.monetaryValueCents, null)
        assert.deepEqual(provider.signals, [])
        assert.notEqual(provider.status, "complete")
      }
      if (mode === "complete-usd") {
        assert.equal(view.freeCash, "USD 4,948.02")
        assert.equal(view.committedNext30Days, "USD 10.00")
        assert.equal(metrics.get("free_cash")!.monetaryValueCents, 494802)
      }
      if (mode === "disabled") {
        assert.match(pageHtml, /Records are retained/)
        assert.deepEqual((await service.loadCommitGuardCashPlanAdapter({ userId: "tenant-a", now })).occurrences, [])
        assert.equal(state.commitments.length, 2)
      }
      if (mode === "precedence") assert.equal(summary.quality.state, "missing")
      if (mode === "stale" || mode === "precedence") assert.equal(provider.stale, true)
    })
  }

  test("7.1 formatter preserves exact signed cents and explicit source codes, including unsupported stored currencies", () => {
    assert.equal(formatCommitGuardMoney(12345, "usd"), "USD 123.45")
    assert.equal(formatCommitGuardMoney(-123, "aud"), "-AUD 1.23")
    assert.equal(formatCommitGuardMoney(0, "eur"), "EUR 0.00")
    assert.equal(formatCommitGuardMoney(12345, "jpy"), "JPY 123.45")
    for (const [amount, currency] of [[null, "usd"], [undefined, "usd"], [NaN, "usd"], [123, null], [123, "invalid"]] as const) {
      assert.equal(formatCommitGuardMoney(amount, currency), "Not available")
    }
  })

  test("one coherent tenant snapshot, saved values, revisions, dates and no Tax Buffer entitlement dependency", async () => {
    const result = await summarize()
    assert.equal(transactions, 1)
    assert.equal(reads.filter((name) => name === "cash").length, 1)
    assert.equal(reads.filter((name) => name === "commitments").length, 1)
    assert.equal(result.version, 2); assert.equal(result.inputRevision, 4); assert.equal(result.calculationRevision, 9)
    assert.equal(result.asOf, now.toISOString()); assert.equal(result.cashContext.balanceAsOf, "2026-10-12")
    assert.equal(result.cashContext.source, "owner_entered"); assert.equal(result.cashContext.freshness, "fresh")
    assert.equal(result.freeCash.freeCashCents, 499000); assert.equal(result.freeCash.status, "safe")
    assert.deepEqual(result.protection.tax.quality.reasons, ["not_applicable"])
    assert.equal(result.sourceDates.commitments[0].updatedAt, now.toISOString())
    assert.doesNotMatch(JSON.stringify(result), /tenant-a|rawSourceData|leaseOwner/)
  })

  test("missing and stale cash never assert WATCH/status, protected/free cash or events", async () => {
    for (const mode of ["missing", "stale"]) {
      state = seed()
      if (mode === "missing") Object.assign(state.cash, { amountCents: null, currency: null, balanceAsOf: null })
      else state.cash.balanceAsOf = new Date("2026-10-11Z")
      const result = await summarize()
      assert.equal(result.quality.state, mode)
      assert.equal(result.freeCash.status, null); assert.equal(result.freeCash.freeCashCents, null)
      assert.equal(result.freeCash.protectedCashCents, null)
      assert.ok(result.quality.actions.includes("update_cash_context"))
    }
  })

  test("explicit zero and negative saved cash remain valid known amounts", async () => {
    state.commitments = []
    for (const [amount, status] of [[0, "at_risk"], [-10, "shortfall"]] as const) {
      state.cash.amountCents = amount
      const result = await summarize()
      assert.equal(result.freeCash.freeCashCents, amount); assert.equal(result.freeCash.status, status)
    }
  })

  test("disabled and missing settings read no defaults into storage and suppress assertions/contribution", async () => {
    for (const settings of [null, { ...baseSettings, enabled: false }]) {
      state.settings = settings
      const result = await summarize()
      assert.equal(result.enabled, false); assert.equal(result.quality.state, "disabled")
      assert.equal(result.freeCash.status, null); assert.equal(result.freeCash.freeCashCents, null)
      assert.deepEqual((await service.loadCommitGuardCashPlanAdapter({ userId: "tenant-a", now })).occurrences, [])
    }
  })

  test("primary precedence retains simultaneous missing, stale, currency and incomplete reasons", async () => {
    state.cash.balanceAsOf = new Date("2026-10-11Z")
    state.settings!.safetyBufferMode = "weeks_operating_expenses"; state.settings!.safetyBufferWeeks = 4
    state.commitments.push({ ...baseCommitment, id: "usd", currency: "usd" })
    const result = await summarize()
    assert.equal(result.quality.state, "missing")
    for (const reason of ["weekly_expenses_missing", "cash_stale", "currency_mismatch"] as const) assert.ok(result.quality.reasons.includes(reason))
    state.settings!.enabled = false
    assert.equal((await summarize()).quality.state, "disabled")
  })

  test("grouped horizons preserve confidence and mixed/unsupported currencies without FX", async () => {
    state.commitments = ["aud", "usd", "jpy"].flatMap((currency) => (["confirmed", "high", "medium", "low"] as const)
      .map((confidence) => ({ ...baseCommitment, id: `${currency}-${confidence}`, currency, confidence })))
    const result = await summarize()
    assert.equal(result.horizons, null); assert.equal(result.quality.state, "unsupported_currency")
    assert.equal(result.freeCash.status, null)
    assert.deepEqual(result.horizonsByCurrency.map((group) => [group.currency, group.horizons[1].totalCents,
      group.horizons[1].confirmedCents, group.horizons[1].probableCents, group.horizons[1].potentialCents]), [
      ["aud", 4000, 1000, 2000, 1000], ["jpy", 4000, 1000, 2000, 1000], ["usd", 4000, 1000, 2000, 1000],
    ])
    assert.equal(result.freeCash.committedCashCents, 4000, "only compatible component, never mixed aggregate")
  })

  test("selected 60-day protection includes day45; percentage basis remains 30-day", async () => {
    state.settings!.defaultHorizonDays = 60
    state.settings!.safetyBufferMode = "percentage_monthly_commitments"; state.settings!.safetyBufferPercent = 10
    state.commitments.push({ ...baseCommitment, id: "day45", amountCents: 4000, nextDueDate: new Date("2026-12-03Z") })
    const result = await summarize()
    assert.equal(result.selectedHorizonDays, 60); assert.equal(result.freeCash.committedCashCents, 5000)
    assert.equal(result.horizons?.find((row) => row.days === 30)?.totalCents, 1000)
    assert.equal(result.freeCash.safetyBufferCents, 100); assert.equal(result.freeCash.freeCashCents, 494900)
  })

  test("weekly basis day7, day8, missing, currency mismatch and overflow use saved fields only", async () => {
    state.settings!.safetyBufferMode = "weeks_operating_expenses"; state.settings!.safetyBufferWeeks = 4
    Object.assign(state.cash, { weeklyOperatingExpensesCents: 20000, weeklyExpensesCurrency: "aud", weeklyExpensesAsOf: new Date("2026-10-12Z") })
    assert.equal((await summarize()).freeCash.safetyBufferCents, 80000)
    state.cash.weeklyExpensesAsOf = new Date("2026-10-11Z")
    assert.equal((await summarize()).quality.state, "stale")
    state.cash.weeklyExpensesAsOf = new Date("2026-10-12Z"); state.cash.weeklyExpensesCurrency = "usd"
    assert.equal((await summarize()).quality.state, "unsupported_currency")
    state.cash.weeklyExpensesCurrency = "aud"; state.cash.weeklyOperatingExpensesCents = 2147483647
    const result = await summarize()
    assert.ok(result.quality.reasons.includes("amount_overflow")); assert.equal(result.freeCash.status, null)
  })

  test("custom recurrence and overflow become unavailable without throwing or partial group totals", async () => {
    state.commitments[0].frequency = "custom"
    let result = await summarize()
    assert.ok(result.quality.reasons.includes("unsupported_recurrence")); assert.equal(result.horizons, null)
    assert.equal(result.freeCash.committedCashCents, null); assert.equal(result.freeCash.status, null)
    state.commitments = [{ ...baseCommitment, amountCents: 2147483647 }, { ...baseCommitment, id: "extra" }]
    result = await summarize()
    assert.ok(result.quality.reasons.includes("amount_overflow")); assert.equal(result.horizons, null)
    assert.deepEqual(result.horizonsByCurrency, [])
  })

  test("full required tax reserve plus aggregate coverage protects max(R,C), not gap or reserved cash", async () => {
    tax = true; state.commitments[0].category = "tax"; state.commitments[0].amountCents = 10000
    state.coverages = [link(10000)]
    let result = await summarize()
    assert.equal(result.freeCash.taxProtectedCashCents, 12000)
    assert.equal(result.protection.additionalTaxReserveCents, 2000)
    assert.equal(result.freeCash.protectedCashCents, 12000)
    assert.equal(result.sourceDates.taxCategories[0].categoryUpdatedAt, now.toISOString())
    for (const amount of [12000, 15000]) {
      state.commitments[0].amountCents = amount; state.coverages[0].coveredCents = amount
      result = await summarize()
      assert.equal(result.freeCash.protectedCashCents, amount)
    }
  })

  test("unlinked/disabled tax targets and unattributed tax bills require review, no zero residual", async () => {
    tax = true; state.commitments[0].category = "tax"
    assert.ok((await summarize()).quality.reasons.includes("tax_overlap_review_required"))
    state.coverages = [link()]; state.categories[0].enabled = false
    let result = await summarize()
    assert.ok(result.quality.reasons.includes("coverage_target_stale")); assert.equal(result.freeCash.status, null)
    state.categories[0].enabled = true; state.coverages = [link(1000, "imported_bill")]
    result = await summarize()
    assert.ok(result.quality.reasons.includes("coverage_tax_attribution_missing"))
    assert.equal(result.freeCash.committedCashCents, 1000)
  })

  test("missing tax config and mixed source currencies are not silently zeroed", async () => {
    tax = true; state.configuration = null
    let result = await summarize()
    assert.equal(result.quality.state, "missing"); assert.equal(result.freeCash.taxProtectedCashCents, null)
    state.configuration = { enabled: true, accountingBasis: "cash" }
    state.categories[0].calculationMethod = "percentage_revenue"; state.categories[0].ratePercent = 10
    result = await summarize()
    assert.equal(result.quality.state, "missing") // adapter's unavailable reserve is a missing component
    assert.ok(result.quality.reasons.includes("tax_source_currencies_mixed"))
    assert.equal(result.sourceDates.taxCategories[0].sources[1].sourceAsOf, now.toISOString())
  })

  test("adapter reuses same revisions/amounts with 13-week source occurrences and no deductions", async () => {
    state.coverages = [link(600, "imported_bill")]
    const summary = await summarize()
    const adapter = await service.loadCommitGuardCashPlanAdapter({ userId: "tenant-a", now })
    assert.equal(transactions, 2, "one transaction per service, not per subloader")
    assert.deepEqual(adapter.freeCash, summary.freeCash); assert.equal(adapter.inputRevision, summary.inputRevision)
    assert.equal(adapter.occurrences[0].id, "commitguard:commitment:2026-10-19")
    assert.equal(adapter.occurrences[0].amountCents, 1000, "adapter does not apply CashPlan deductions")
    assert.equal(adapter.occurrences[0].coverage[0].coveredCents, 600)
    assert.deepEqual(adapter.window, { start: "2026-10-19", endExclusive: "2027-01-18" })
  })

  test("both endpoints enforce 401/403 before financial reads", async () => {
    for (const route of [summaryRoute, adapterRoute]) for (const mode of ["missing", "auth", "subscription", "core"]) {
      user = mode === "missing" ? null : { id: "tenant-a" }; authError = mode === "auth"
      subscription = mode !== "subscription"; core = mode !== "core"
      assert.equal((await route.GET(new Request("http://localhost/api/commitguard/summary"))).status,
        mode === "missing" || mode === "auth" ? 401 : 403)
    }
    assert.equal(transactions, 0)
  })

  test("both endpoints reject all legacy override values/unknown keys with stable safe Zod 400", async () => {
    for (const route of [summaryRoute, adapterRoute]) for (const key of ["cashAvailableCents", "taxProtectedCashCents",
      "weeklyOperatingExpensesCents", "cashCurrency", "taxProtectionCurrency", "weeklyExpensesCurrency",
      "weeklyExpensesAsOf", "balanceAsOf", "amountCents", "userId", "horizonDays", "__proto__"]) {
      for (const value of ["", "0", "NaN", "2147483648"]) {
        const response = await route.GET(new Request(`http://localhost/api/commitguard/summary?${key}=${value}`))
        assert.equal(response.status, 400)
        assert.deepEqual(await response.json(), { error: COMMIT_GUARD_QUERY_MIGRATION_MESSAGE })
      }
    }
    assert.equal(transactions, 0)
  })

  test("GET success is v2, no writes, and unexpected errors are safe 500", async () => {
    for (const route of [summaryRoute, adapterRoute]) {
      const response = await route.GET(new Request("http://localhost/api/commitguard/summary"))
      assert.equal(response.status, 200)
      const body = await response.json()
      assert.equal((body.summary ?? body).version, 2)
      failRead = true
      const failed = await route.GET(new Request("http://localhost/api/commitguard/summary"))
      assert.equal(failed.status, 500); assert.deepEqual(await failed.json(), { error: "Internal server error" })
      failRead = false
    }
  })
})