import type { WorkspaceQuery, WorkspaceSummary } from "@/lib/commitguard/workspace"
import { workspaceQueryString, WorkspaceQuerySchema } from "@/lib/commitguard/workspaceFilters"

const ANNUAL_MULTIPLIERS: Readonly<Record<string, number>> = {
  weekly: 52, fortnightly: 26, monthly: 12, quarterly: 4, six_monthly: 2, annual: 1,
}

/** Source-currency run rate, not a forecast or FX conversion. Never infer a
 * cadence for a one-off, custom or unknown schedule, even for a zero amount. */
export function annualizedRenewalAmount(amountCents: number, frequency: string): number | null {
  const factor = Object.hasOwn(ANNUAL_MULTIPLIERS, frequency) ? ANNUAL_MULTIPLIERS[frequency] : undefined
  if (!factor || !Number.isSafeInteger(amountCents) || amountCents < 0) return null
  const annual = amountCents * factor
  return Number.isSafeInteger(annual) ? annual : null
}

export function selectWorkspaceRenewals(rows: WorkspaceSummary["renewals"], query: WorkspaceQuery): {
  items: WorkspaceSummary["renewals"]; page: number; totalPages: number; total: number
} {
  const params = WorkspaceQuerySchema.parse(query)
  const ordered = [...rows].sort((a, b) => Date.parse(a.noticeCloseDate) - Date.parse(b.noticeCloseDate)
    || a.commitmentId.localeCompare(b.commitmentId, "en"))
  const totalPages = Math.max(1, Math.ceil(ordered.length / 8))
  const page = Math.min(totalPages, Number(params.renewalPage ?? 1))
  return { items: ordered.slice((page - 1) * 8, page * 8), page, totalPages, total: ordered.length }
}

export function renewalPageHref(params: WorkspaceQuery, page: number): string {
  return `/dashboard/commitguard?${workspaceQueryString({ ...params, renewalPage: String(page) })}#commitguard-renewals`
}