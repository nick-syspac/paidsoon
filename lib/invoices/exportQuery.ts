import { withUserContext } from "@/lib/db/withUserContext"
import {
  ACTIVE_INVOICE_STATUSES,
  RESOLVED_INVOICE_STATUSES,
  loadDashboardInvoicesWithTx,
  type InvoiceWithRelations,
} from "@/lib/dashboard/loadDashboardInvoices"
import {
  computeHeldInvoiceIds,
  loadBrokenPromiseCountsByDebtorWithTx,
  loadEscalationThresholdWithTx,
} from "@/lib/dashboard/loadDashboardRiskSignals"
import { loadDashboardContextWithTx } from "@/lib/dashboard/loadDashboardContext"
import {
  filterInvoicesByOverviewCard,
  type InvoiceOverviewFilter,
} from "@/lib/dashboard/overviewCards"

/** Every known TrackedInvoice.status value — used for the Settings "all invoices" export default. */
const ALL_INVOICE_STATUSES = [...ACTIVE_INVOICE_STATUSES, ...RESOLVED_INVOICE_STATUSES]

export type ExportDateField = "due_date" | "created_date"

export interface ExportQueryParams {
  userId: string
  /** The dashboard's active/resolved bucket — used by the quick dashboard export. Ignored when `statuses` is set. */
  statusBucket?: "active" | "resolved"
  /** The dashboard's categorical overview-card filter — used by the quick dashboard export. */
  overviewFilter?: InvoiceOverviewFilter | null
  /** An explicit status allow-list — used by the Settings advanced export. Takes priority over `statusBucket`. */
  statuses?: string[]
  customerId?: string
  provider?: string
  dateField?: ExportDateField
  dateFrom?: Date
  dateTo?: Date
}

export function resolveStatuses(params: Pick<ExportQueryParams, "statuses" | "statusBucket">): string[] {
  if (params.statuses && params.statuses.length > 0) return params.statuses
  if (params.statusBucket === "resolved") return RESOLVED_INVOICE_STATUSES
  if (params.statusBucket === "active") return ACTIVE_INVOICE_STATUSES
  return ALL_INVOICE_STATUSES
}

function matchesDateRange(
  invoice: InvoiceWithRelations,
  dateField: ExportDateField | undefined,
  dateFrom: Date | undefined,
  dateTo: Date | undefined,
): boolean {
  if (!dateFrom && !dateTo) return true
  const field = dateField ?? "due_date"
  const value = field === "created_date" ? invoice.createdAt : invoice.dueDate
  if (dateFrom && value < dateFrom) return false
  if (dateTo && value > dateTo) return false
  return true
}

export interface ExportFilterContext {
  brokenPromiseCountsByDebtor: Record<string, number>
  escalationThreshold: number
  heldInvoiceIds: Set<string>
}

/**
 * Pure filtering step, split out from `loadInvoicesForExport` so the
 * status-bucket/overview-card/customer/provider/date-range filter
 * combinations can be unit tested without a database. `invoices` must
 * already be scoped to `params.userId`'s tenant (e.g. loaded via
 * `withUserContext`) — a `customerId`/`provider` belonging to another
 * tenant simply matches nothing here, it is never fetched cross-tenant.
 */
export function applyExportFilters(
  invoices: InvoiceWithRelations[],
  params: Pick<ExportQueryParams, "overviewFilter" | "customerId" | "provider" | "dateField" | "dateFrom" | "dateTo">,
  context: ExportFilterContext,
): InvoiceWithRelations[] {
  const overviewFiltered = filterInvoicesByOverviewCard(invoices, params.overviewFilter ?? null, context)

  return overviewFiltered.filter((invoice) => {
    if (params.customerId && invoice.customerId !== params.customerId) return false
    if (params.provider && invoice.provider !== params.provider) return false
    if (!matchesDateRange(invoice, params.dateField, params.dateFrom, params.dateTo)) return false
    return true
  })
}

/**
 * Loads the tenant-scoped, filtered invoice set an export request should
 * contain. Single shared code path for the dashboard quick-export and the
 * Settings advanced-export screen (design.md § Decisions — "Shared
 * filter/query service"). A `customerId`/`provider` value that belongs to
 * another tenant can never match, because filtering happens over invoices
 * already scoped to `userId` inside `withUserContext`.
 */
export async function loadInvoicesForExport(params: ExportQueryParams): Promise<InvoiceWithRelations[]> {
  const statuses = resolveStatuses(params)

  return withUserContext(params.userId, async (tx) => {
    const invoices = await loadDashboardInvoicesWithTx(tx, params.userId, statuses, { updatedAt: "desc" })
    if (invoices.length === 0) return []

    const { chaseAllowance } = await loadDashboardContextWithTx(tx, params.userId)
    const brokenPromiseCountsByDebtor = await loadBrokenPromiseCountsByDebtorWithTx(tx, params.userId)
    const escalationThreshold = await loadEscalationThresholdWithTx(tx, params.userId)
    const heldInvoiceIds = computeHeldInvoiceIds(invoices, chaseAllowance?.atCapacity ?? false)

    return applyExportFilters(invoices, params, {
      brokenPromiseCountsByDebtor,
      escalationThreshold,
      heldInvoiceIds,
    })
  })
}

