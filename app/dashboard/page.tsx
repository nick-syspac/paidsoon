import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { loadDashboardContext } from "@/lib/dashboard/loadDashboardContext"
import {
  ACTIVE_INVOICE_STATUSES,
  loadDashboardInvoices,
} from "@/lib/dashboard/loadDashboardInvoices"
import {
  computeHeldInvoiceIds,
  loadBrokenPromiseCountsByDebtor,
  loadEscalationThreshold,
} from "@/lib/dashboard/loadDashboardRiskSignals"
import { buildOverviewCards } from "@/lib/dashboard/overviewCards"
import { OverviewCards } from "@/components/dashboard/OverviewCards"
import {
  createServerTraceContext,
  traceEvent,
  warnIfProductionDebugEnabled,
} from "@/lib/diagnostics/server"
import { summariseAuthForTrace } from "@/lib/diagnostics/shared"

const COMPONENT = "app/dashboard/page.tsx"

export default async function DashboardOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ resolved?: string }>
}) {
  const requestHeaders = await headers()
  const traceContext = createServerTraceContext({
    headers: requestHeaders,
    cookieHeader: requestHeaders.get("cookie"),
  })
  warnIfProductionDebugEnabled(traceContext)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    traceEvent(
      () => ({
        traceId: traceContext.traceId,
        stage: "dashboard.page.redirect",
        operation: "redirect_unauthenticated_page",
        subsystem: "dashboard",
        component: COMPONENT,
        event: "decision",
        navigation: { from: "/dashboard", to: "/sign-in", decision: "page_unauthenticated" },
        auth: summariseAuthForTrace({ user: null }),
      }),
      traceContext,
    )
    redirect("/sign-in")
  }

  // Legacy link support: `/dashboard?resolved=1` used to render the resolved
  // invoice view on this same route — it now lives at its own route
  // (openspec/changes/add-dashboard-overview).
  const params = await searchParams
  if (params.resolved === "1") {
    traceEvent(
      () => ({
        traceId: traceContext.traceId,
        stage: "dashboard.page.redirect",
        operation: "redirect_legacy_resolved_param",
        subsystem: "dashboard",
        component: COMPONENT,
        event: "decision",
        navigation: { from: "/dashboard?resolved=1", to: "/dashboard/resolved", decision: "legacy_query_param" },
      }),
      traceContext,
    )
    redirect("/dashboard/resolved")
  }

  const { chaseAllowance } = await loadDashboardContext(user.id, traceContext, COMPONENT)

  const activeInvoices = await loadDashboardInvoices(
    user.id,
    ACTIVE_INVOICE_STATUSES,
    { nextEmailAt: "asc" },
    traceContext,
    COMPONENT,
  )

  const brokenPromiseCountsByDebtor = await loadBrokenPromiseCountsByDebtor(
    user.id,
    traceContext,
    COMPONENT,
  )
  const escalationThreshold = await loadEscalationThreshold(user.id, traceContext, COMPONENT)

  const heldInvoiceIds = computeHeldInvoiceIds(activeInvoices, chaseAllowance?.atCapacity ?? false)

  const cards = buildOverviewCards({
    activeInvoices,
    chaseAllowance,
    brokenPromiseCountsByDebtor,
    escalationThreshold,
    heldInvoiceCount: heldInvoiceIds.size,
  })

  traceEvent(
    () => ({
      traceId: traceContext.traceId,
      stage: "dashboard.page.render",
      operation: "render_dashboard_overview",
      subsystem: "dashboard",
      component: COMPONENT,
      event: "complete",
      outputs: { cardSeverities: Object.fromEntries(cards.map((card) => [card.id, card.severity])) },
    }),
    traceContext,
  )

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-900">Overview</h1>
      <OverviewCards cards={cards} />
    </div>
  )
}

