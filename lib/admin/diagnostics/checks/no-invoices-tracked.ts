import type { TenantSnapshot } from "@/lib/admin/tenantSnapshot"
import type { Diagnostic } from "@/lib/admin/diagnostics/types"

const GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

/**
 * Check: no-invoices-tracked
 *
 * Flags when a tenant's account is older than 7 days and they have zero
 * TrackedInvoice records in any state. A grace period is applied so that
 * new accounts are not immediately flagged.
 */
export function checkNoInvoicesTracked(snapshot: TenantSnapshot): Diagnostic | null {
  const { profile, invoiceCounts } = snapshot

  // Within grace period — do not flag
  if (Date.now() - profile.createdAt.getTime() < GRACE_PERIOD_MS) return null

  if (invoiceCounts.total > 0) return null

  return {
    slug: "no-invoices-tracked",
    severity: "info",
    title: "No invoices tracked",
    description:
      "The tenant has not tracked any invoices after 7 days. They may not have connected a Stripe account, or they may not have any overdue invoices.",
    runbookSlug: "no-invoices-tracked",
    actions: [],
  }
}
