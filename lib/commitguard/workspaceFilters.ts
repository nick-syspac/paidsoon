import { z } from "zod"
import { AlertEntityIdSchema } from "@/lib/commitguard/alertPresentation"
import type { WorkspaceCommitment } from "@/lib/commitguard/workspace"

export const WORKSPACE_STATUSES = ["active", "upcoming", "ending", "review", "paused", "cancelled", "expired"] as const
export const WORKSPACE_ESSENTIALITIES = ["critical", "essential", "operational", "discretionary"] as const
export const WORKSPACE_FREQUENCIES = ["one_off", "weekly", "fortnightly", "monthly", "quarterly", "six_monthly", "annual", "custom"] as const
export const WORKSPACE_SOURCES = ["manual", "accounting_integration", "bank_transaction_pattern", "spendleak", "costguard", "import", "system_inferred"] as const
export const WORKSPACE_SORTS = ["nextDueDate", "amountCents", "updatedAt", "name"] as const
export const WORKSPACE_DUE_PERIODS = ["7", "30", "60", "90", "overdue", "unscheduled"] as const
export const COMMITMENT_PAGE_SIZE = 12

// Keep URL values as strings across page, refetch, and link boundaries. Never
// coerce flags/arrays/objects into strings or accept fractional/unsafe pages.
const optionalText = <T extends z.ZodType>(schema: T) => z.preprocess(
  (value) => value === "" ? undefined : value, schema.optional(),
)
const PageSchema = z.string().max(17).regex(/^-?\d+$/).refine((value) => Number.isSafeInteger(Number(value)))
  .transform((value) => String(Math.max(1, Number(value))))
export const WorkspaceQuerySchema = z.object({
  search: optionalText(z.string().trim().max(500)),
  category: optionalText(z.string().trim().min(1).max(100)),
  status: optionalText(z.enum(["all", ...WORKSPACE_STATUSES])),
  essentiality: optionalText(z.enum(WORKSPACE_ESSENTIALITIES)),
  frequency: optionalText(z.enum(WORKSPACE_FREQUENCIES)),
  source: optionalText(z.enum(WORKSPACE_SOURCES)),
  currency: optionalText(z.string().regex(/^[a-zA-Z]{3}$/).transform((value) => value.toLowerCase())),
  duePeriod: optionalText(z.enum(WORKSPACE_DUE_PERIODS)),
  dueFrom: optionalText(z.iso.date()), dueTo: optionalText(z.iso.date()),
  sortBy: optionalText(z.enum(WORKSPACE_SORTS)), sortOrder: optionalText(z.enum(["asc", "desc"])),
  page: optionalText(PageSchema), alertPage: optionalText(PageSchema), renewalPage: optionalText(PageSchema),
  costGuardAlertId: optionalText(AlertEntityIdSchema), linkedSpendInsightId: optionalText(AlertEntityIdSchema),
  eventId: optionalText(AlertEntityIdSchema), commitmentId: optionalText(AlertEntityIdSchema),
}).strict().refine((query) => !query.dueFrom || !query.dueTo || query.dueFrom < query.dueTo,
  { message: "Due before must be after due from", path: ["dueTo"] })
export type WorkspaceQuery = z.infer<typeof WorkspaceQuerySchema>

export type WorkspaceCommitmentPage = {
  items: WorkspaceCommitment[]; page: number; totalPages: number; total: number; pageSize: number;
  totalCommitments: number; categories: string[]; currencies: string[]
}

/** Read-only selection over the safe tenant snapshot, before slicing. Financial
 * totals, mutation controls, candidates, alerts and renewals are never filtered. */
export function selectWorkspaceCommitments(rows: WorkspaceCommitment[], query: WorkspaceQuery, asOf: string): WorkspaceCommitmentPage {
  const params = WorkspaceQuerySchema.parse(query)
  const today = Date.parse(`${asOf.slice(0, 10)}T00:00:00Z`)
  const search = params.search?.toLowerCase()
  const filtered = rows.filter((row) => {
    if (params.status ? params.status !== "all" && row.status !== params.status : !["active", "upcoming", "ending", "review"].includes(row.status)) return false
    for (const key of ["category", "essentiality", "frequency", "source", "currency"] as const) {
      if (params[key] && row[key] !== params[key]) return false
    }
    if (params.costGuardAlertId && row.linkedCostGuardAlertId !== params.costGuardAlertId) return false
    if (params.linkedSpendInsightId && row.linkedSpendInsightId !== params.linkedSpendInsightId) return false
    if (search && ![row.name, row.category, row.supplierName ?? "", row.notes ?? ""].join(" ").toLowerCase().includes(search)) return false
    const due = row.nextDueDate ? Date.parse(row.nextDueDate) : NaN
    if (params.duePeriod === "unscheduled" && Number.isFinite(due)) return false
    if (params.duePeriod === "overdue" && !(due < today)) return false
    if (params.duePeriod && /^\d+$/.test(params.duePeriod) && !(due >= today && due < today + Number(params.duePeriod) * 86400000)) return false
    // Explicit half-open UTC date range, just like the approved horizon windows.
    if (params.dueFrom && !(due >= Date.parse(`${params.dueFrom}T00:00:00Z`))) return false
    if (params.dueTo && !(due < Date.parse(`${params.dueTo}T00:00:00Z`))) return false
    return true
  }).sort((left, right) => {
    const key = params.sortBy ?? "nextDueDate"
    const direction = params.sortOrder === "desc" ? -1 : 1
    // Null dates stay last in either direction; an identity tie-breaker prevents
    // rows moving between pages when dates/amounts/names are equal.
    if (key === "nextDueDate" && (!left.nextDueDate || !right.nextDueDate)) {
      if (Boolean(left.nextDueDate) !== Boolean(right.nextDueDate)) return left.nextDueDate ? -1 : 1
    }
    const comparison = key === "amountCents" ? left.amountCents - right.amountCents
      : key === "name" ? left.name.localeCompare(right.name, "en")
        : (Date.parse(left[key] ?? "") || 0) - (Date.parse(right[key] ?? "") || 0)
    return direction * comparison || left.id.localeCompare(right.id, "en")
  })
  const totalPages = Math.max(1, Math.ceil(filtered.length / COMMITMENT_PAGE_SIZE))
  const page = Math.min(totalPages, Number(params.page ?? 1))
  return { items: filtered.slice((page - 1) * COMMITMENT_PAGE_SIZE, page * COMMITMENT_PAGE_SIZE),
    page, totalPages, total: filtered.length, pageSize: COMMITMENT_PAGE_SIZE, totalCommitments: rows.length,
    categories: [...new Set(rows.map((row) => row.category))].sort(), currencies: [...new Set(rows.map((row) => row.currency))].sort() }
}

export function workspaceQueryString(params: WorkspaceQuery): string {
  return new URLSearchParams(Object.entries(params).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1] !== "")).toString()
}
export function commitmentPageHref(params: WorkspaceQuery, page: number): string {
  return `/dashboard/commitguard?${workspaceQueryString({ ...params, page: String(page) })}#commitguard-upcoming`
}