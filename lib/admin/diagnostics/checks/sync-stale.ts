import type { TenantSnapshot } from "@/lib/admin/tenantSnapshot"
import type { Diagnostic } from "@/lib/admin/diagnostics/types"

const STALE_THRESHOLD_MS = 48 * 60 * 60 * 1000 // 48 hours

/**
 * Check: sync-stale
 *
 * Returns one Diagnostic per accounting connection that is:
 *  - in "error" or "disconnected" status, OR
 *  - in "active" status but last synced more than 48 hours ago.
 */
export function checkSyncStale(snapshot: TenantSnapshot): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const now = new Date()

  for (const conn of snapshot.accountingConns) {
    const isErrored = conn.status === "error" || conn.status === "disconnected"
    const isStale =
      conn.status === "active" &&
      conn.lastSyncedAt !== null &&
      now.getTime() - conn.lastSyncedAt.getTime() > STALE_THRESHOLD_MS

    if (!isErrored && !isStale) continue

    const providerLabel = conn.provider === "xero" ? "Xero" : conn.provider === "myob" ? "MYOB" : conn.provider
    const reason = isErrored
      ? `Connection status is "${conn.status}".`
      : `Last synced ${conn.lastSyncedAt ? conn.lastSyncedAt.toLocaleString("en-AU") : "never"}, more than 48 hours ago.`

    diagnostics.push({
      slug: "sync-stale",
      severity: "warning",
      title: `${providerLabel} connection out of sync — ${conn.organisationName}`,
      description: `The ${providerLabel} connection for "${conn.organisationName}" is not syncing correctly. ${reason}`,
      runbookSlug: "sync-stale",
      actions: [
        {
          actionSlug: "trigger-resync",
          label: "Trigger resync",
          description: `Initiate a manual sync for the ${providerLabel} connection.`,
          payload: { connectionId: conn.id },
        },
      ],
    })
  }

  return diagnostics
}
