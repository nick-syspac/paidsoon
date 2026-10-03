import { syncConnection, type SyncResult } from "@/lib/providers/accounting/sync"
import { withUserContext } from "@/lib/db/withUserContext"

const WORKER_DISPATCH_FAILED = "worker_dispatch_failed"

function failedDispatchResult(connectionId: string, provider: string): SyncResult {
  return {
    connectionId,
    provider,
    status: "failed",
    invoicesCreated: 0,
    invoicesUpdated: 0,
    invoicesSkipped: 0,
    spendBillsUpserted: 0,
    spendTransactionsUpserted: 0,
    spendSuppliersUpserted: 0,
    errorMessage: WORKER_DISPATCH_FAILED,
  }
}

async function recordDispatchFailure(params: {
  connectionId: string
  userId: string
  startedAt: Date
}): Promise<SyncResult> {
  const { connectionId, userId, startedAt } = params
  let provider = ""

  try {
    await withUserContext(userId, async (tx) => {
      const connection = await tx.accountingConnection.findFirst({
        where: { id: connectionId, userId },
        select: { provider: true, userId: true },
      })
      if (!connection) return

      provider = connection.provider
      await tx.accountingSyncRun.create({
        data: {
          accountingConnectionId: connectionId,
          provider: connection.provider,
          userId: connection.userId,
          startedAt,
          completedAt: new Date(),
          status: "failed",
          invoicesCreated: 0,
          invoicesUpdated: 0,
          invoicesSkipped: 0,
          errorMessage: WORKER_DISPATCH_FAILED,
        },
      })
      await tx.accountingConnection.updateMany({
        where: {
          id: connectionId,
          userId,
          status: "pending_first_sync",
          lastSyncedAt: null,
        },
        data: { status: "error" },
      })
    })
  } catch {
    // Do not leak database details or turn dispatch acknowledgement loss into
    // an inline duplicate sync. Redirect handlers may still continue safely.
    console.error("[accounting sync] failed to persist worker dispatch failure")
  }

  return failedDispatchResult(connectionId, provider)
}

/**
 * Triggers an immediate sync for one accounting connection, initiated by a
 * user clicking "Sync now" in the dashboard. If the Railway Celery worker is
 * configured (RAILWAY_WORKER_URL + WORKER_TRIGGER_SECRET set), delegates to
 * it so the sync runs as a queued, retryable Celery task instead of inline
 * on this Vercel request — see design.md "Keep these on Vercel: starting an
 * immediate sync when the user clicks a button".
 *
 * Runs inline only when worker configuration is absent or incomplete.
 * A configured-worker failure never causes automatic inline fallback.
 */
export async function triggerSyncNow(
  connectionId: string,
  userId: string,
): Promise<SyncResult | { queued: true; claimId: string }> {
  const workerUrl = process.env.RAILWAY_WORKER_URL
  const triggerSecret = process.env.WORKER_TRIGGER_SECRET

  if (workerUrl && triggerSecret) {
    const startedAt = new Date()
    try {
      const response = await fetch(`${workerUrl.replace(/\/$/, "")}/trigger/sync-connection`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${triggerSecret}`,
        },
        body: JSON.stringify({ accountingConnectionId: connectionId, userId }),
      })
      if (!response.ok) throw new Error("Worker rejected dispatch")

      const acknowledgement: unknown = await response.json()
      if (
        typeof acknowledgement !== "object" || acknowledgement === null ||
        !("queued" in acknowledgement) || acknowledgement.queued !== true ||
        !("claimId" in acknowledgement) || typeof acknowledgement.claimId !== "string" ||
        acknowledgement.claimId.trim().length === 0
      ) {
        throw new Error("Invalid worker acknowledgement")
      }
      return { queued: true, claimId: acknowledgement.claimId }
    } catch {
      return recordDispatchFailure({ connectionId, userId, startedAt })
    }
  }

  return syncConnection(connectionId)
}
