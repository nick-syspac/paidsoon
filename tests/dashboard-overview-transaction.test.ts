import assert from "node:assert/strict"
import { before, mock, test } from "node:test"

const calls: string[] = []
let transactionCount = 0
let loadDashboardOverview: typeof import("@/lib/dashboard/loadDashboardOverview").loadDashboardOverview

before(async () => {
  await mock.module("@/lib/dashboard/loadDashboardProfile", {
    namedExports: {
      getDashboardProfile: async (userId: string) => {
        calls.push(`profile:${userId}`)
        return { userId }
      },
    },
  })
  await mock.module("@/lib/dashboard/loadDashboardContext", {
    namedExports: {
      loadDashboardContextWithProfileTx: async (_tx: unknown, userId: string) => {
        calls.push(`context:${userId}`)
        return { profile: { userId }, connection: null, chaseAllowance: null }
      },
    },
  })
  await mock.module("@/lib/dashboard/loadDashboardInvoices", {
    namedExports: {
      ACTIVE_INVOICE_STATUSES: ["pending"],
      loadDashboardInvoicesWithTx: async (_tx: unknown, userId: string) => {
        calls.push(`invoices:${userId}`)
        return []
      },
    },
  })
  await mock.module("@/lib/dashboard/loadDashboardRiskSignals", {
    namedExports: {
      loadBrokenPromiseCountsByDebtorWithTx: async (_tx: unknown, userId: string) => {
        calls.push(`broken-promises:${userId}`)
        return {}
      },
      loadEscalationThresholdWithTx: async (_tx: unknown, userId: string) => {
        calls.push(`escalation-threshold:${userId}`)
        return 2
      },
    },
  })
  await mock.module("@/lib/dashboard/loadDashboardMetrics", {
    namedExports: {
      loadDashboardMetricsWithTx: async (_tx: unknown, userId: string) => {
        calls.push(`metrics:${userId}`)
        return {
          paidInvoices: [],
          paidCountAllTime: 0,
          manuallyResolvedCountAllTime: 0,
          remindersSentToday: 0,
        }
      },
    },
  })
  await mock.module("@/lib/db/withUserContext", {
    namedExports: {
      withUserContext: async (userId: string, operation: (tx: unknown) => Promise<unknown>) => {
        transactionCount += 1
        calls.push(`rls:${userId}`)
        return operation({})
      },
    },
  })
  await mock.module("@/lib/diagnostics/server", {
    namedExports: {
      traceOperation: async (
        _context: unknown,
        _input: unknown,
        operation: () => Promise<unknown>,
      ) => operation(),
    },
  })

  ;({ loadDashboardOverview } = await import("@/lib/dashboard/loadDashboardOverview"))
})

test("loads the complete overview inside one tenant RLS transaction", async () => {
  calls.length = 0
  transactionCount = 0

  await loadDashboardOverview(
    "user-1",
    { traceId: "trace-1", debugEnabled: false },
    "dashboard-test",
  )

  assert.equal(transactionCount, 1)
  assert.deepStrictEqual(calls, [
    "profile:user-1",
    "rls:user-1",
    "context:user-1",
    "invoices:user-1",
    "broken-promises:user-1",
    "escalation-threshold:user-1",
    "metrics:user-1",
  ])
})

test("does not reuse an overview transaction across tenant identities", async () => {
  calls.length = 0
  transactionCount = 0

  await loadDashboardOverview(
    "user-1",
    { traceId: "trace-1", debugEnabled: false },
    "dashboard-test",
  )
  await loadDashboardOverview(
    "user-2",
    { traceId: "trace-2", debugEnabled: false },
    "dashboard-test",
  )

  assert.equal(transactionCount, 2)
  assert.deepStrictEqual(
    calls.filter((call) => call.startsWith("rls:") || call.startsWith("context:")),
    ["rls:user-1", "context:user-1", "rls:user-2", "context:user-2"],
  )
})