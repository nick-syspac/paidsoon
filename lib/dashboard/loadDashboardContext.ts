import { withUserContext } from "@/lib/db/withUserContext"
import type { PrismaTx } from "@/lib/db/withUserContext"
import {
  getChaseAllowanceStatusForAccount,
  type ChaseAllowanceStatus,
} from "@/lib/billing"
import { traceOperation } from "@/lib/diagnostics/server"
import type { TraceContext } from "@/lib/diagnostics/shared"
import type { InvoiceConnection, UserProfile } from "@/lib/generated/prisma/client"

export interface DashboardContext {
  profile: UserProfile | null
  connection: InvoiceConnection | null
  chaseAllowance: ChaseAllowanceStatus | null
}

export async function loadDashboardContextWithTx(
  tx: PrismaTx,
  userId: string,
): Promise<DashboardContext> {
  const profile = await tx.userProfile.findUnique({ where: { userId } })
  return loadDashboardContextWithProfileTx(tx, userId, profile)
}

export async function loadDashboardContextWithProfileTx(
  tx: PrismaTx,
  userId: string,
  profile: UserProfile | null,
): Promise<DashboardContext> {
  const connection = await tx.invoiceConnection.findFirst({
    where: { userId, isActive: true },
  })
  const chaseAllowance = profile
    ? await getChaseAllowanceStatusForAccount(tx, userId, profile)
    : null
  return { profile, connection, chaseAllowance }
}

/**
 * Loads the profile + active invoice connection + chase-allowance status
 * shared by every `/dashboard` route (Overview, Invoices, Resolved Invoices).
 * Extracted so the three routes issue the same queries once, not three times
 * (openspec/changes/add-dashboard-overview).
 */
export async function loadDashboardContext(
  userId: string,
  traceContext: TraceContext,
  component: string,
): Promise<DashboardContext> {
  return traceOperation(
    traceContext,
    {
      traceId: traceContext.traceId,
      stage: "dashboard.load_context",
      operation: "withUserContext.dashboardInitialData",
      subsystem: "dashboard",
      component,
      tenant: { context: "user_rls" },
    },
    () => withUserContext(userId, (tx) => loadDashboardContextWithTx(tx, userId)),
    {
      success: (result) => ({
        outputs: {
          profilePresent: Boolean(result.profile),
          connectionPresent: Boolean(result.connection),
          chaseUsage: result.chaseAllowance?.usage ?? null,
          chaseAllowance: result.chaseAllowance?.allowance ?? null,
        },
      }),
    },
  )
}
