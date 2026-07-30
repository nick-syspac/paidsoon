import type { TenantSnapshot } from "@/lib/admin/tenantSnapshot"
import type { Diagnostic } from "@/lib/admin/diagnostics/types"

/**
 * Check: stripe-connect-disconnected
 *
 * Flags when a tenant has no active Stripe Connect invoice connection.
 * Without this, invoice data cannot be synced from Stripe.
 */
export function checkStripeConnectDisconnected(snapshot: TenantSnapshot): Diagnostic | null {
  if (snapshot.stripeInvoiceConn !== null) return null

  return {
    slug: "stripe-connect-disconnected",
    severity: "warning",
    title: "Stripe Connect not connected",
    description:
      "The tenant has not connected a Stripe account. Invoice follow-ups require a connected Stripe account to read overdue invoices.",
    runbookSlug: "stripe-connect-disconnected",
    actions: [],
  }
}
