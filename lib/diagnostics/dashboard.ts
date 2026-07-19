export type DashboardRenderState = "locked_preview" | "empty_state" | "invoice_table"

export type DashboardRenderTraceSummary = {
  renderState: DashboardRenderState
  showResolved: boolean
  invoiceCount: number
  hasConnection: boolean
  atLimit: boolean
}

export function getDashboardRenderState(canShowDashboardModule: boolean, invoiceCount: number): DashboardRenderState {
  if (!canShowDashboardModule) return "locked_preview"
  return invoiceCount === 0 ? "empty_state" : "invoice_table"
}

export function buildDashboardRenderTraceSummary(input: {
  canShowDashboardModule: boolean
  invoiceCount: number
  showResolved: boolean
  hasConnection: boolean
  atLimit: boolean
}): DashboardRenderTraceSummary {
  return {
    renderState: getDashboardRenderState(input.canShowDashboardModule, input.invoiceCount),
    showResolved: input.showResolved,
    invoiceCount: input.invoiceCount,
    hasConnection: input.hasConnection,
    atLimit: input.atLimit,
  }
}
