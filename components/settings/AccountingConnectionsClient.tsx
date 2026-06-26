"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

interface AccountingConnectionRow {
  id: string
  provider: "xero" | "myob"
  organisationName: string
  status: string
  lastSyncedAt: string | null
  recentRuns: Array<{
    id: string
    startedAt: string
    completedAt: string | null
    status: string
    invoicesCreated: number
    invoicesUpdated: number
    errorMessage: string | null
  }>
}

const PROVIDER_LABELS: Record<string, string> = {
  xero: "Xero",
  myob: "MYOB Business",
}

const STATUS_BADGES: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  disconnected: "bg-gray-100 text-gray-600",
  revoked: "bg-red-100 text-red-700",
  error: "bg-yellow-100 text-yellow-800",
}

function SyncStatusBadge({ status }: { status: string }) {
  const cls = STATUS_BADGES[status] ?? "bg-gray-100 text-gray-600"
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {status}
    </span>
  )
}

function ConnectionCard({
  connection,
  onSync,
  onDisconnect,
  syncing,
  disconnecting,
}: {
  connection: AccountingConnectionRow
  onSync: (id: string) => void
  onDisconnect: (id: string) => void
  syncing: boolean
  disconnecting: boolean
}) {
  const [showHistory, setShowHistory] = useState(false)

  return (
    <div className="border border-gray-200 rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-medium text-sm text-gray-900">
            {PROVIDER_LABELS[connection.provider] ?? connection.provider}
          </p>
          <p className="text-sm text-gray-500">{connection.organisationName}</p>
          {connection.lastSyncedAt && (
            <p className="text-xs text-gray-400 mt-0.5">
              Last synced: {new Date(connection.lastSyncedAt).toLocaleString()}
            </p>
          )}
        </div>
        <SyncStatusBadge status={connection.status} />
      </div>

      {connection.status === "revoked" && (
        <div className="bg-red-50 border border-red-200 rounded-md px-3 py-2 text-xs text-red-700">
          Access was revoked. Reconnect to resume invoice syncing.
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {connection.status === "active" && (
          <button
            onClick={() => onSync(connection.id)}
            disabled={syncing}
            className="px-3 py-1.5 text-xs font-medium text-white bg-gray-900 rounded-md hover:bg-gray-700 disabled:opacity-50"
          >
            {syncing ? "Syncing…" : "Sync now"}
          </button>
        )}
        {connection.status === "revoked" && (
          <a
            href={`/api/integrations/${connection.provider}/connect`}
            className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-500"
          >
            Reconnect
          </a>
        )}
        <button
          onClick={() => onDisconnect(connection.id)}
          disabled={disconnecting}
          className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
        >
          {disconnecting ? "Disconnecting…" : "Disconnect"}
        </button>
        {connection.recentRuns.length > 0 && (
          <button
            onClick={() => setShowHistory((v) => !v)}
            className="px-3 py-1.5 text-xs font-medium text-gray-500 bg-white border border-gray-200 rounded-md hover:bg-gray-50"
          >
            {showHistory ? "Hide history" : "Sync history"}
          </button>
        )}
      </div>

      {showHistory && connection.recentRuns.length > 0 && (
        <div className="border-t border-gray-100 pt-3">
          <p className="text-xs font-medium text-gray-600 mb-2">Recent sync runs</p>
          <div className="space-y-1">
            {connection.recentRuns.map((run) => (
              <div
                key={run.id}
                className="flex items-center justify-between text-xs text-gray-500"
              >
                <span>{new Date(run.startedAt).toLocaleString()}</span>
                <span
                  className={
                    run.status === "success"
                      ? "text-green-700"
                      : run.status === "partial"
                      ? "text-yellow-700"
                      : "text-red-600"
                  }
                >
                  {run.status}
                  {run.status !== "failed" &&
                    ` — ${run.invoicesCreated} new, ${run.invoicesUpdated} updated`}
                  {run.errorMessage && ` (${run.errorMessage})`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function AccountingConnectionsClient({
  connections,
  hasFeature,
  successMessage,
  errorMessage,
}: {
  connections: AccountingConnectionRow[]
  hasFeature: boolean
  successMessage: string | null
  errorMessage: string | null
}) {
  const router = useRouter()
  const [syncingId, setSyncingId] = useState<string | null>(null)
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null)

  async function handleSync(connectionId: string) {
    const conn = connections.find((c) => c.id === connectionId)
    if (!conn) return

    setSyncingId(connectionId)
    try {
      await fetch(`/api/integrations/${conn.provider}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId }),
      })
    } finally {
      setSyncingId(null)
      router.refresh()
    }
  }

  async function handleDisconnect(connectionId: string) {
    const conn = connections.find((c) => c.id === connectionId)
    if (!conn) return
    if (
      !confirm(
        `Disconnect ${PROVIDER_LABELS[conn.provider]}? Active reminder sequences for invoices from this account will be paused.`
      )
    )
      return

    setDisconnectingId(connectionId)
    try {
      await fetch(`/api/integrations/${conn.provider}/disconnect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId }),
      })
    } finally {
      setDisconnectingId(null)
      router.refresh()
    }
  }

  if (!hasFeature) {
    return (
      <div className="max-w-lg space-y-4">
        <h2 className="text-base font-medium text-gray-900">Accounting Integrations</h2>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-2">
          <p className="text-sm font-medium text-amber-900">Solo plan required</p>
          <p className="text-sm text-amber-800">
            Connect Xero or MYOB Business to automatically import overdue invoices.
            Available on the Solo and Small Business plans.
          </p>
          <a
            href="/dashboard/settings/subscription"
            className="inline-block mt-1 px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-md hover:bg-amber-500"
          >
            Upgrade plan
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-lg space-y-5">
      <h2 className="text-base font-medium text-gray-900">Accounting Integrations</h2>
      <p className="text-sm text-gray-500">
        Connect your accounting software to automatically import overdue invoices and send
        reminder emails.
      </p>

      {successMessage && (
        <div className="bg-green-50 border border-green-200 rounded-md px-4 py-2 text-sm text-green-800">
          {successMessage === "xero_connected"
            ? "Xero connected successfully."
            : successMessage === "myob_connected"
            ? "MYOB connected successfully."
            : "Connected successfully."}
        </div>
      )}

      {errorMessage && (
        <div className="bg-red-50 border border-red-200 rounded-md px-4 py-2 text-sm text-red-700">
          {errorMessage === "upgrade_required"
            ? "Accounting integrations require the Solo plan or above."
            : errorMessage === "xero_cancelled" || errorMessage === "myob_cancelled"
            ? "Connection was cancelled."
            : errorMessage === "no_organisations"
            ? "No organisations found in your account. Ensure you have at least one organisation."
            : `Error: ${errorMessage}`}
        </div>
      )}

      {connections.length > 0 && (
        <div className="space-y-3">
          {connections.map((conn) => (
            <ConnectionCard
              key={conn.id}
              connection={conn}
              onSync={handleSync}
              onDisconnect={handleDisconnect}
              syncing={syncingId === conn.id}
              disconnecting={disconnectingId === conn.id}
            />
          ))}
        </div>
      )}

      <div className="border-t border-gray-100 pt-4 space-y-3">
        <p className="text-xs font-medium text-gray-600 uppercase tracking-wide">
          Connect a new account
        </p>
        <div className="flex gap-3 flex-wrap">
          <a
            href="/api/integrations/xero/connect"
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-800 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <span>Connect Xero</span>
          </a>
          <a
            href="/api/integrations/myob/connect"
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-800 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <span>Connect MYOB</span>
          </a>
        </div>
      </div>
    </div>
  )
}
