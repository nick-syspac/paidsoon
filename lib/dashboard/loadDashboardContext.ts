import { withUserContext } from "@/lib/db/withUserContext"
import { getChaseAllowanceStatus, type ChaseAllowanceStatus } from "@/lib/billing"
import { traceOperation } from "@/lib/diagnostics/server"
import type { TraceContext } from "@/lib/diagnostics/shared"
import type { InvoiceConnection, UserProfile } from "@/lib/generated/prisma/client"

export interface DashboardContext {
  profile: UserProfile | null
  connection: InvoiceConnection | null
  chaseAllowance: ChaseAllowanceStatus | null
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
    () =>
      withUserContext(userId, async (tx) => {
        // Sequential, not Promise.all: queries on a single interactive
        // transaction's `tx` share one underlying pg connection — firing them
        // concurrently triggers a pg client deprecation warning and is unsafe.
        const profile = await tx.userProfile.findUnique({ where: { userId } })
        const connection = await tx.invoiceConnection.findFirst({
          where: { userId, isActive: true },
        })
        const chaseAllowance = await getChaseAllowanceStatus(tx, userId)
        return { profile, connection, chaseAllowance }
      }),
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
