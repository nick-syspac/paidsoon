import assert from "node:assert/strict"
import { test } from "node:test"
import {
  runDashboardOverviewLoaders,
  type DashboardOverviewLoaderDependencies,
} from "@/lib/dashboard/loadDashboardOverview"

test("runs each overview loader once in safe transaction order", async () => {
  const calls: string[] = []
  const transaction = { transactionId: "tx-1" }

  const loaders: DashboardOverviewLoaderDependencies<typeof transaction> = {
    loadContext: async (tx, userId) => {
      calls.push(`context:${tx.transactionId}:${userId}`)
      return { profile: null, connection: null, chaseAllowance: null }
    },
    loadInvoices: async (tx, userId) => {
      calls.push(`invoices:${tx.transactionId}:${userId}`)
      return []
    },
    loadBrokenPromiseCounts: async (tx, userId) => {
      calls.push(`broken-promises:${tx.transactionId}:${userId}`)
      return { "debtor@example.com": 2 }
    },
    loadEscalationThreshold: async (tx, userId) => {
      calls.push(`escalation-threshold:${tx.transactionId}:${userId}`)
      return 3
    },
    loadMetrics: async (tx, userId) => {
      calls.push(`metrics:${tx.transactionId}:${userId}`)
      return {
        paidInvoices: [],
        paidCountAllTime: 4,
        manuallyResolvedCountAllTime: 1,
        remindersSentToday: 5,
      }
    },
  }

  const result = await runDashboardOverviewLoaders(transaction, "user-1", loaders)

  assert.deepStrictEqual(calls, [
    "context:tx-1:user-1",
    "invoices:tx-1:user-1",
    "broken-promises:tx-1:user-1",
    "escalation-threshold:tx-1:user-1",
    "metrics:tx-1:user-1",
  ])
  assert.deepStrictEqual(result, {
    context: { profile: null, connection: null, chaseAllowance: null },
    activeInvoices: [],
    brokenPromiseCountsByDebtor: { "debtor@example.com": 2 },
    escalationThreshold: 3,
    metrics: {
      paidInvoices: [],
      paidCountAllTime: 4,
      manuallyResolvedCountAllTime: 1,
      remindersSentToday: 5,
    },
  })
})