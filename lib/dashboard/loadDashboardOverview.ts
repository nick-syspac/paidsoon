import type { DashboardContext } from "@/lib/dashboard/loadDashboardContext"
import type { InvoiceWithRelations } from "@/lib/dashboard/loadDashboardInvoices"
import type { DashboardMetricsContext } from "@/lib/dashboard/loadDashboardMetrics"
import { loadDashboardContextWithProfileTx } from "@/lib/dashboard/loadDashboardContext"
import {
  ACTIVE_INVOICE_STATUSES,
  loadDashboardInvoicesWithTx,
} from "@/lib/dashboard/loadDashboardInvoices"
import { loadDashboardMetricsWithTx } from "@/lib/dashboard/loadDashboardMetrics"
import {
  loadBrokenPromiseCountsByDebtorWithTx,
  loadEscalationThresholdWithTx,
} from "@/lib/dashboard/loadDashboardRiskSignals"
import { withUserContext, type PrismaTx } from "@/lib/db/withUserContext"
import { traceOperation } from "@/lib/diagnostics/server"
import type { TraceContext } from "@/lib/diagnostics/shared"
import { getDashboardProfile } from "@/lib/dashboard/loadDashboardProfile"
import type { UserProfile } from "@/lib/generated/prisma/client"

export interface DashboardOverviewData {
  context: DashboardContext
  activeInvoices: InvoiceWithRelations[]
  brokenPromiseCountsByDebtor: Record<string, number>
  escalationThreshold: number
  metrics: DashboardMetricsContext
}

export interface DashboardOverviewLoaderDependencies<Transaction> {
  loadContext: (tx: Transaction, userId: string) => Promise<DashboardContext>
  loadInvoices: (tx: Transaction, userId: string) => Promise<InvoiceWithRelations[]>
  loadBrokenPromiseCounts: (tx: Transaction, userId: string) => Promise<Record<string, number>>
  loadEscalationThreshold: (tx: Transaction, userId: string) => Promise<number>
  loadMetrics: (tx: Transaction, userId: string) => Promise<DashboardMetricsContext>
}

export async function runDashboardOverviewLoaders<Transaction>(
  tx: Transaction,
  userId: string,
  loaders: DashboardOverviewLoaderDependencies<Transaction>,
): Promise<DashboardOverviewData> {
  const context = await loaders.loadContext(tx, userId)
  const activeInvoices = await loaders.loadInvoices(tx, userId)
  const brokenPromiseCountsByDebtor = await loaders.loadBrokenPromiseCounts(tx, userId)
  const escalationThreshold = await loaders.loadEscalationThreshold(tx, userId)
  const metrics = await loaders.loadMetrics(tx, userId)

  return {
    context,
    activeInvoices,
    brokenPromiseCountsByDebtor,
    escalationThreshold,
    metrics,
  }
}

function createOverviewLoaders(
  profile: UserProfile | null,
): DashboardOverviewLoaderDependencies<PrismaTx> {
  return {
  loadContext: (tx, userId) => loadDashboardContextWithProfileTx(tx, userId, profile),
  loadInvoices: (tx, userId) =>
    loadDashboardInvoicesWithTx(tx, userId, ACTIVE_INVOICE_STATUSES, { nextEmailAt: "asc" }),
  loadBrokenPromiseCounts: loadBrokenPromiseCountsByDebtorWithTx,
  loadEscalationThreshold: loadEscalationThresholdWithTx,
  loadMetrics: loadDashboardMetricsWithTx,
  }
}

export async function loadDashboardOverview(
  userId: string,
  traceContext: TraceContext,
  component: string,
): Promise<DashboardOverviewData> {
  return traceOperation(
    traceContext,
    {
      traceId: traceContext.traceId,
      stage: "dashboard.load_overview",
      operation: "withUserContext.dashboardOverview",
      subsystem: "dashboard",
      component,
      tenant: { context: "user_rls" },
    },
    async () => {
      const profile = await getDashboardProfile(userId)
      return withUserContext(userId, (tx) =>
        runDashboardOverviewLoaders(tx, userId, createOverviewLoaders(profile)),
      )
    },
    {
      success: (result) => ({
        outputs: {
          activeInvoiceCount: result.activeInvoices.length,
          paidInvoiceCount: result.metrics.paidInvoices.length,
          brokenPromiseDebtorCount: Object.keys(result.brokenPromiseCountsByDebtor).length,
        },
      }),
    },
  )
}