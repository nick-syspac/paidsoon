/**
 * Diagnostics engine — runs all checks over a TenantSnapshot and returns
 * a sorted list of issues (errors first, warnings second, info last).
 */

import type { TenantSnapshot } from "@/lib/admin/tenantSnapshot"
import type { Diagnostic, DiagnosticSeverity } from "@/lib/admin/diagnostics/types"
import { checkCustomFromUnverified } from "@/lib/admin/diagnostics/checks/custom-from-unverified"
import { checkTrialLapsed } from "@/lib/admin/diagnostics/checks/trial-lapsed"
import { checkStripeConnectDisconnected } from "@/lib/admin/diagnostics/checks/stripe-connect-disconnected"
import { checkSyncStale } from "@/lib/admin/diagnostics/checks/sync-stale"
import { checkNoInvoicesTracked } from "@/lib/admin/diagnostics/checks/no-invoices-tracked"

const SEVERITY_ORDER: Record<DiagnosticSeverity, number> = {
  error: 0,
  warning: 1,
  info: 2,
}

/**
 * Run all diagnostic checks against a TenantSnapshot.
 * Returns sorted results: errors first, warnings second, info last.
 */
export function runDiagnostics(snapshot: TenantSnapshot): Diagnostic[] {
  const results: Diagnostic[] = []

  // Collect single-result checks
  const singles = [
    checkCustomFromUnverified(snapshot),
    checkTrialLapsed(snapshot),
    checkStripeConnectDisconnected(snapshot),
    checkNoInvoicesTracked(snapshot),
  ]
  for (const d of singles) {
    if (d !== null) results.push(d)
  }

  // Collect multi-result checks (one per connection)
  results.push(...checkSyncStale(snapshot))

  // Sort by severity
  results.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])

  return results
}

export type { Diagnostic, DiagnosticSeverity, DiagnosticAction } from "@/lib/admin/diagnostics/types"
