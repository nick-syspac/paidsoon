import assert from "node:assert/strict"
import { before, beforeEach, describe, test, mock } from "node:test"

type DigestRow = {
  id: string
  userId: string
  frequency: string
  periodLabel: string | null
  periodStart: Date
  periodEnd: Date
  status: string
  summary: string
  summaryMode: string
  dataAsOf: Date | null
  generatedAt: Date
  lastRegeneratedAt: Date | null
  generationSource: string
  generationState: string
  providerSuccessCount: number
  providerFailureCount: number
  providerStaleCount: number
  topAttentionCount: number
  opportunityCount: number
  positiveCount: number
  infoCount: number
  completenessStatus: string
  completenessSummary: string | null
  statusReason: string | null
}

type ItemRow = {
  id: string
  snapshotId: string
  source: string
  signalType: string
  title: string
  summary: string
  severity: string
  priorityScore: number
  section: string
  sortOrder: number
  recommendedAction: string | null
  actionUrl: string | null
  whyItMatters: string | null
  financialImpactCents: number | null
  currentValue: number | null
  previousValue: number | null
  changeValue: number | null
  changePercent: number | null
  entityType: string | null
  entityId: string | null
  entityName: string | null
  contributingSources: unknown
  detectedAt: Date
  metadata: unknown
}

type MetricRow = {
  snapshotId: string
  metricKey: string
  label: string
  section: string | null
  unit: string
  displayValue: string
  numericValue: number | null
  monetaryValueCents: number | null
  previousNumericValue: number | null
  previousMonetaryValueCents: number | null
  changeNumericValue: number | null
  changeMonetaryValueCents: number | null
  changePercent: number | null
  sortOrder: number
  metadata: unknown
}

type ProviderRunRow = {
  snapshotId: string
  source: string
  status: string
  signalCount: number
  surfacedCount: number
  stale: boolean
  entitled: boolean
  configured: boolean
  available: boolean
  dataAsOf: Date | null
  errorCode: string | null
  errorSummary: string | null
}

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
let spendLeakImpl: () => Promise<{
  findings: Array<{ id: string; estimatedAnnualCents?: number | null }>
  linkedCommitmentCountsByFindingId: Record<string, number>
  modules: unknown[]
  latestSyncAt: Date | null
  hasAccountingConnection: boolean
  isStale: boolean
  sourceSyncCount: number
  status: { title: string; description: string }
}> = async () => ({
  findings: [],
  linkedCommitmentCountsByFindingId: {},
  modules: [],
  latestSyncAt: null,
  hasAccountingConnection: false,
  isStale: false,
  sourceSyncCount: 0,
  status: { title: "Not connected", description: "Not connected" },
})
let taxBufferImpl: () => Promise<{
  accountingBasis: "cash"
  availableCashCents: number | null
  committedOutflowsCents: number
  totalRequiredReserveCents: number
  totalReservedCents: number
  reserveGapCents: number
  safeToSpendCents: number | null
  healthStatus: string
  warnings: string[]
  categories: Array<unknown>
  recommendation: { transferNowCents: number; weeklyTargetCents: number; reasons: string[] }
}> = async () => ({
  accountingBasis: "cash",
  availableCashCents: null,
  committedOutflowsCents: 0,
  totalRequiredReserveCents: 0,
  totalReservedCents: 0,
  reserveGapCents: 0,
  safeToSpendCents: null,
  healthStatus: "unknown",
  warnings: [],
  categories: [],
  recommendation: { transferNowCents: 0, weeklyTargetCents: 0, reasons: [] },
})
let commitGuardImpl: () => Promise<{
  settings: { enabled: boolean }
  horizons: unknown[]
  renewals: unknown[]
  freeCash: { status: string; freeCashCents: number; protectedCashCents: number }
}> = async () => ({
  settings: { enabled: false },
  horizons: [],
  renewals: [],
  freeCash: { status: "safe", freeCashCents: 0, protectedCashCents: 0 },
})
let marginImpl: () => Promise<{
  revenueCents: number
  grossProfitCents: number
  grossMarginPercent: number | null
  completenessPercent: number
  status: string
}> = async () => ({
  revenueCents: 0,
  grossProfitCents: 0,
  grossMarginPercent: null,
  completenessPercent: 0,
  status: "healthy",
})

let digestRows: DigestRow[] = []
let itemRows: ItemRow[] = []
let metricRows: MetricRow[] = []
let providerRunRows: ProviderRunRow[] = []
let snapshotCounter = 1
let settingsRow = {
  userId: "user-1",
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
  minimumMaterialityCents: 10000,
  sendWhenEmpty: true,
  recipientScope: "owner_only",
}

function hydrateSnapshot(snapshot: DigestRow) {
  return {
    ...snapshot,
    items: itemRows.filter((row) => row.snapshotId === snapshot.id),
    metrics: metricRows.filter((row) => row.snapshotId === snapshot.id),
    providerRuns: providerRunRows.filter((row) => row.snapshotId === snapshot.id),
  }
}

function buildTx() {
  return {
    ownersDigestSetting: {
      upsert: async ({ create, update }: { create: typeof settingsRow; update: Partial<typeof settingsRow> }) => {
        settingsRow = { ...settingsRow, ...create, ...update }
        return settingsRow
      },
    },
    ownersDigestSnapshot: {
      findUnique: async ({ where }: { where: { userId_frequency_periodStart_periodEnd: { userId: string; frequency: string; periodStart: Date; periodEnd: Date } } }) => {
        const match = digestRows.find(
          (row) =>
            row.userId === where.userId_frequency_periodStart_periodEnd.userId &&
            row.frequency === where.userId_frequency_periodStart_periodEnd.frequency &&
            row.periodStart.getTime() === where.userId_frequency_periodStart_periodEnd.periodStart.getTime() &&
            row.periodEnd.getTime() === where.userId_frequency_periodStart_periodEnd.periodEnd.getTime(),
        )
        return match ? hydrateSnapshot(match) : null
      },
      upsert: async ({ where, create, update }: { where: { userId_frequency_periodStart_periodEnd: { userId: string; frequency: string; periodStart: Date; periodEnd: Date } }; create: Omit<DigestRow, "id">; update: Partial<Omit<DigestRow, "id">> }) => {
        const existing = digestRows.find(
          (row) =>
            row.userId === where.userId_frequency_periodStart_periodEnd.userId &&
            row.frequency === where.userId_frequency_periodStart_periodEnd.frequency &&
            row.periodStart.getTime() === where.userId_frequency_periodStart_periodEnd.periodStart.getTime() &&
            row.periodEnd.getTime() === where.userId_frequency_periodStart_periodEnd.periodEnd.getTime(),
        )
        if (existing) {
          Object.assign(existing, update)
          return { id: existing.id }
        }

        const row: DigestRow = { id: `snapshot-${snapshotCounter++}`, ...create }
        digestRows.push(row)
        return { id: row.id }
      },
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
        const row = digestRows.find((entry) => entry.id === where.id)
        if (!row) throw new Error("Not found")
        return hydrateSnapshot(row)
      },
    },
    ownersDigestItem: {
      deleteMany: async ({ where }: { where: { snapshotId: string } }) => {
        itemRows = itemRows.filter((row) => row.snapshotId !== where.snapshotId)
        return { count: 1 }
      },
      createMany: async ({ data }: { data: Array<Omit<ItemRow, "id">> }) => {
        data.forEach((row, index) => itemRows.push({ id: `item-${index + 1}-${row.snapshotId}`, ...row }))
        return { count: data.length }
      },
    },
    ownersDigestMetric: {
      deleteMany: async ({ where }: { where: { snapshotId: string } }) => {
        metricRows = metricRows.filter((row) => row.snapshotId !== where.snapshotId)
        return { count: 1 }
      },
      createMany: async ({ data }: { data: MetricRow[] }) => {
        metricRows.push(...data)
        return { count: data.length }
      },
    },
    ownersDigestProviderRun: {
      deleteMany: async ({ where }: { where: { snapshotId: string } }) => {
        providerRunRows = providerRunRows.filter((row) => row.snapshotId !== where.snapshotId)
        return { count: 1 }
      },
      createMany: async ({ data }: { data: ProviderRunRow[] }) => {
        providerRunRows.push(...data)
        return { count: data.length }
      },
    },
    trackedInvoice: { findMany: async () => trackedInvoices },
    costGuardAlert: { findMany: async () => costGuardAlerts },
    cashPlanSnapshot: { findFirst: async () => cashPlanSnapshot },
    runwayGuardSnapshot: { findFirst: async () => runwaySnapshot },
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ownersDigestService: any

describe("Owner's Digest degraded-state and idempotency", () => {
  before(async () => {
    await mock.module("@/lib/db/withUserContext", {
      namedExports: {
        withUserContext: async (_userId: string, fn: (tx: unknown) => unknown) => fn(buildTx()),
      },
    })

    await mock.module("@/lib/ownersDigest/entitlements", {
      namedExports: {
        requireOwnersDigestCoreAccess: async () => undefined,
        requireOwnersDigestHistoryAccess: async () => undefined,
        getOwnersDigestEntitlements: async () => ({
          tier: "small_business",
          hasCoreAccess: true,
          hasEmailAccess: true,
          hasHistoryAccess: true,
        }),
      },
    })

    await mock.module("@/lib/dashboard/loadSpendLeakDashboard", {
      namedExports: {
        loadSpendLeakDashboard: async () => spendLeakImpl(),
      },
    })

    await mock.module("@/lib/taxBuffer/service", {
      namedExports: {
        loadTaxBufferSummary: async () => taxBufferImpl(),
      },
    })

    await mock.module("@/lib/commitguard/service", {
      namedExports: {
        summarizeCommitGuard: async () => commitGuardImpl(),
      },
    })

    await mock.module("@/lib/marginguard/service", {
      namedExports: {
        getMarginSummary: async () => marginImpl(),
      },
    })

    ownersDigestService = await import("@/lib/ownersDigest/service")
  })

  beforeEach(() => {
    trackedInvoices = []
    costGuardAlerts = []
    cashPlanSnapshot = null
    runwaySnapshot = null
    digestRows = []
    itemRows = []
    metricRows = []
    providerRunRows = []
    snapshotCounter = 1
    spendLeakImpl = async () => ({
      findings: [],
      linkedCommitmentCountsByFindingId: {},
      modules: [],
      latestSyncAt: null,
      hasAccountingConnection: false,
      isStale: false,
      sourceSyncCount: 0,
      status: { title: "Not connected", description: "Not connected" },
    })
    taxBufferImpl = async () => ({
      accountingBasis: "cash",
      availableCashCents: null,
      committedOutflowsCents: 0,
      totalRequiredReserveCents: 0,
      totalReservedCents: 0,
      reserveGapCents: 0,
      safeToSpendCents: null,
      healthStatus: "unknown",
      warnings: [],
      categories: [],
      recommendation: { transferNowCents: 0, weeklyTargetCents: 0, reasons: [] },
    })
    commitGuardImpl = async () => ({
      settings: { enabled: false },
      horizons: [],
      renewals: [],
      freeCash: { status: "safe", freeCashCents: 0, protectedCashCents: 0 },
    })
    marginImpl = async () => ({
      revenueCents: 0,
      grossProfitCents: 0,
      grossMarginPercent: null,
      completenessPercent: 0,
      status: "healthy",
    })
  })

  test("first digest with no configured data generates an insufficient-data snapshot", async () => {
    const digest = await ownersDigestService.getCurrentOwnersDigest("user-1")

    assert.equal(digest.id, "snapshot-1")
    assert.equal(digest.completenessStatus, "partial")
    assert.equal(typeof digest.completenessSummary, "string")
    assert.equal(digest.items.length, 0)
    assert.equal(digestRows.length, 1)
  })

  test("same-period regeneration reuses the canonical snapshot identity", async () => {
    trackedInvoices = [
      {
        id: "tracked-1",
        updatedAt: new Date("2026-01-12T07:00:00.000Z"),
        status: "pending",
        financialInvoice: {
          amountDueCents: 25_000,
          dueDate: new Date("2025-12-01T00:00:00.000Z"),
          invoiceNumber: "INV-1",
          contact: { name: "Client A" },
        },
      },
    ]

    const now = new Date("2026-01-12T07:00:00.000Z")
    const first = await ownersDigestService.generateOwnersDigest("user-1", { now, source: "manual" })
    const second = await ownersDigestService.generateOwnersDigest("user-1", { now, source: "manual" })

    assert.equal(first.id, second.id)
    assert.equal(digestRows.length, 1)
  })

  test("provider failure isolation still persists a partial digest", async () => {
    trackedInvoices = [
      {
        id: "tracked-1",
        updatedAt: new Date("2026-01-12T07:00:00.000Z"),
        status: "pending",
        financialInvoice: {
          amountDueCents: 25_000,
          dueDate: new Date("2025-12-01T00:00:00.000Z"),
          invoiceNumber: "INV-1",
          contact: { name: "Client A" },
        },
      },
    ]
    spendLeakImpl = async () => {
      throw new Error("provider unavailable")
    }

    const digest = await ownersDigestService.generateOwnersDigest("user-1", {
      now: new Date("2026-01-12T07:00:00.000Z"),
      source: "page_load",
    })

    assert.equal(digest.completenessStatus, "partial")
    assert.match(digest.completenessSummary ?? "", /modules? were unavailable/)
    assert.equal(digest.providers.some((provider: { source: string; status: string }) => provider.source === "spendleak" && provider.status === "unavailable"), true)
    assert.equal(digest.items.length > 0, true)
  })

  test("stale provider data is surfaced in digest completeness metadata", async () => {
    trackedInvoices = [
      {
        id: "tracked-1",
        updatedAt: new Date("2026-01-12T07:00:00.000Z"),
        status: "pending",
        financialInvoice: {
          amountDueCents: 25_000,
          dueDate: new Date("2025-12-01T00:00:00.000Z"),
          invoiceNumber: "INV-1",
          contact: { name: "Client A" },
        },
      },
    ]
    spendLeakImpl = async () => ({
      findings: [{ id: "finding-1", estimatedAnnualCents: 50_000 }],
      linkedCommitmentCountsByFindingId: {},
      modules: [],
      latestSyncAt: new Date("2025-12-01T00:00:00.000Z"),
      hasAccountingConnection: true,
      isStale: true,
      sourceSyncCount: 1,
      status: { title: "Stale", description: "Stale source data" },
    })

    const digest = await ownersDigestService.generateOwnersDigest("user-1", {
      now: new Date("2026-01-12T07:00:00.000Z"),
      source: "page_load",
    })

    assert.equal(digest.completenessStatus, "partial")
    assert.equal(
      digest.providers.some(
        (provider: { source: string; stale: boolean }) =>
          provider.source === "spendleak" && provider.stale === true,
      ),
      true,
    )
  })
})
