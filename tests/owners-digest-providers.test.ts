import assert from "node:assert/strict"
import { before, beforeEach, describe, mock, test } from "node:test"

let trackedInvoices: Array<{
  id: string
  updatedAt: Date
  status: string
  financialInvoice: {
    amountDueCents: number
    dueDate: Date
    invoiceNumber: string | null
    contact: { name: string | null } | null
  }
}> = []
let costGuardAlerts: Array<{
  id: string
  alertType: string
  severity: string
  title: string
  description: string
  varianceAmountCents: number
  actualAmountCents: number
  baselineAmountCents: number
  variancePercent: number
  detectedAt: Date
}> = []
let cashPlanSnapshot: {
  createdAt: Date
  confidence: number
  status: string
  lowestClosingCashCents: number
  bufferGapCents: number
} | null = null
let runwaySnapshot: {
  snapshotAt: Date
  runwayDays: number
  usableCashCents: number
  status: string
} | null = null
const spendLeakDashboard = {
  findings: [{ id: "finding-1", estimatedAnnualCents: 120000 }],
  linkedCommitmentCountsByFindingId: {},
  modules: [],
  latestSyncAt: new Date("2026-01-12T07:00:00.000Z"),
  hasAccountingConnection: true,
  isStale: false,
  sourceSyncCount: 1,
  status: { title: "Healthy", description: "Healthy" },
}
const taxBufferSummary = {
  accountingBasis: "cash",
  availableCashCents: 100000,
  committedOutflowsCents: 5000,
  totalRequiredReserveCents: 30000,
  totalReservedCents: 10000,
  reserveGapCents: 20000,
  safeToSpendCents: 65000,
  healthStatus: "underfunded",
  warnings: [],
  categories: [{ categoryId: "gst", type: "gst", name: "GST", requiredReserveCents: 30000, reservedCents: 10000, shortfallCents: 20000, confidence: "medium", source: "manual", explainability: [] }],
  recommendation: { transferNowCents: 20000, weeklyTargetCents: 5000, reasons: [] },
} as const
const commitGuardSummary = {
  settings: { enabled: true },
  horizons: [],
  renewals: [],
  freeCash: { status: "at_risk", freeCashCents: 15000, protectedCashCents: 35000 },
}
const marginSummary = {
  revenueCents: 100000,
  grossProfitCents: 25000,
  grossMarginPercent: 25,
  completenessPercent: 80,
  status: "warning",
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let providersModule: any

describe("Owner's Digest providers", () => {
  before(async () => {
    await mock.module("@/lib/db/withUserContext", {
      namedExports: {
        withUserContext: async (_userId: string, fn: (tx: unknown) => unknown) =>
          fn({
            trackedInvoice: { findMany: async () => trackedInvoices },
            costGuardAlert: { findMany: async () => costGuardAlerts },
            cashPlanSnapshot: { findFirst: async () => cashPlanSnapshot },
            runwayGuardSnapshot: { findFirst: async () => runwaySnapshot },
          }),
      },
    })

    await mock.module("@/lib/dashboard/loadSpendLeakDashboard", {
      namedExports: {
        loadSpendLeakDashboard: async () => spendLeakDashboard,
      },
    })

    await mock.module("@/lib/taxBuffer/service", {
      namedExports: {
        loadTaxBufferSummary: async () => taxBufferSummary,
      },
    })

    await mock.module("@/lib/commitguard/service", {
      namedExports: {
        summarizeCommitGuard: async () => commitGuardSummary,
      },
    })

    await mock.module("@/lib/marginguard/service", {
      namedExports: {
        getMarginSummary: async () => marginSummary,
      },
    })

    providersModule = await import("@/lib/ownersDigest/service")
  })

  beforeEach(() => {
    trackedInvoices = [
      {
        id: "tracked-1",
        updatedAt: new Date("2026-01-12T07:00:00.000Z"),
        status: "pending",
        financialInvoice: {
          amountDueCents: 25000,
          dueDate: new Date("2025-12-01T00:00:00.000Z"),
          invoiceNumber: "INV-1",
          contact: { name: "Client A" },
        },
      },
    ]
    costGuardAlerts = [
      {
        id: "alert-1",
        alertType: "SUPPLIER_INCREASE",
        severity: "warning",
        title: "Supplier spend increased",
        description: "Supplier spend is above baseline.",
        varianceAmountCents: 15000,
        actualAmountCents: 40000,
        baselineAmountCents: 25000,
        variancePercent: 60,
        detectedAt: new Date("2026-01-12T07:00:00.000Z"),
      },
    ]
    cashPlanSnapshot = {
      createdAt: new Date("2026-01-12T07:00:00.000Z"),
      confidence: 90,
      status: "watch",
      lowestClosingCashCents: 20000,
      bufferGapCents: -12000,
    }
    runwaySnapshot = {
      snapshotAt: new Date("2026-01-12T07:00:00.000Z"),
      runwayDays: 35,
      usableCashCents: 30000,
      status: "warning",
    }
  })

  test("PaidSoon provider emits overdue warning signals", async () => {
    const result = await providersModule.loadPaidSoonProvider("user-1", new Date("2026-01-12T07:00:00.000Z"))
    assert.equal(result.source, "paidsoon")
    assert.equal(result.signals[0].severity, "critical")
  })

  test("SpendLeak provider emits opportunity signal", async () => {
    const result = await providersModule.loadSpendLeakProvider("user-1", new Date("2026-01-12T07:00:00.000Z"))
    assert.equal(result.source, "spendleak")
    assert.equal(result.signals[0].severity, "opportunity")
  })

  test("Cost Guard provider emits warning signal", async () => {
    const result = await providersModule.loadCostGuardProvider("user-1", new Date("2026-01-12T07:00:00.000Z"))
    assert.equal(result.source, "costguard")
    assert.equal(result.signals[0].severity, "warning")
  })

  test("CashPlan provider emits cash-risk signal from negative buffer gap", async () => {
    const result = await providersModule.loadCashPlanProvider("user-1", new Date("2026-01-12T07:00:00.000Z"))
    assert.equal(result.source, "cashplan")
    assert.equal(result.signals[0].severity, "warning")
  })

  test("Tax Buffer provider emits reserve-gap signal", async () => {
    const result = await providersModule.loadTaxBufferProvider("user-1", new Date("2026-01-12T07:00:00.000Z"))
    assert.equal(result.source, "taxbuffer")
    assert.equal(result.signals[0].severity, "critical")
  })

  test("CommitGuard provider emits free-cash risk signal", async () => {
    const result = await providersModule.loadCommitGuardProvider("user-1", new Date("2026-01-12T07:00:00.000Z"))
    assert.equal(result.source, "commitguard")
    assert.equal(result.signals[0].severity, "warning")
  })

  test("MarginGuard provider emits margin warning signal", async () => {
    const result = await providersModule.loadMarginGuardProvider("user-1", new Date("2026-01-12T07:00:00.000Z"))
    assert.equal(result.source, "marginguard")
    assert.equal(result.signals[0].severity, "warning")
  })

  test("RunwayGuard provider emits runway warning signal", async () => {
    const result = await providersModule.loadRunwayGuardProvider("user-1", new Date("2026-01-12T07:00:00.000Z"))
    assert.equal(result.source, "runwayguard")
    assert.equal(result.signals[0].severity, "warning")
  })
})
