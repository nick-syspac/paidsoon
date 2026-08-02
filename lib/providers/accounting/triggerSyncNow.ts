import { syncConnection, type SyncResult } from "@/lib/providers/accounting/sync"

/**
 * Triggers an immediate sync for one accounting connection, initiated by a
 * user clicking "Sync now" in the dashboard. If the Railway Celery worker is
 * configured (RAILWAY_WORKER_URL + WORKER_TRIGGER_SECRET set), delegates to
 * it so the sync runs as a queued, retryable Celery task instead of inline
 * on this Vercel request — see design.md "Keep these on Vercel: starting an
 * immediate sync when the user clicks a button".
 *
 * Falls back to running `syncConnection` inline (today's behavior) when
 * those env vars are unset, so this is a safe, reversible switch: nothing
 * changes until the Railway worker is actually deployed and configured.
 */
export async function triggerSyncNow(
  connectionId: string,
  userId: string,
): Promise<SyncResult | { queued: true; claimId: string }> {
  const workerUrl = process.env.RAILWAY_WORKER_URL
  const triggerSecret = process.env.WORKER_TRIGGER_SECRET

  if (workerUrl && triggerSecret) {
    const response = await fetch(`${workerUrl.replace(/\/$/, "")}/trigger/sync-connection`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${triggerSecret}`,
      },
      body: JSON.stringify({ accountingConnectionId: connectionId, userId }),
    })
    if (!response.ok) {
      throw new Error(`Railway worker trigger failed: ${response.status}`)
    }
    return response.json()
  }

  return syncConnection(connectionId)
}
