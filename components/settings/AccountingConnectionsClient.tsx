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

type ProviderType = "xero" | "myob"

const PROVIDER_LABELS: Record<ProviderType, string> = {
  xero: "Xero",
  myob: "MYOB Business",
}

const PROVIDER_DESCRIPTIONS: Record<ProviderType, string> = {
  xero: "Import overdue invoices from Xero and keep reminder sequences in sync.",
  myob: "Import overdue MYOB Business invoices and pause or resume follow-ups from one place.",
}

const PROVIDER_KICKERS: Record<ProviderType, string> = {
  xero: "Accounting",
  myob: "Accounting",
}

const STATUS_BADGES: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  pending_first_sync: "bg-blue-100 text-blue-800",
  disconnected: "bg-gray-100 text-gray-600",
  revoked: "bg-red-100 text-red-700",
  error: "bg-yellow-100 text-yellow-800",
}

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  pending_first_sync: "Importing\u2026",
  disconnected: "Disconnected",
  revoked: "Revoked",
  error: "Sync error",
}

// Statuses from which the user can trigger (or retry) a sync.
const SYNCABLE_STATUSES = new Set(["active", "pending_first_sync", "error"])

function SyncStatusBadge({ status }: { status: string }) {
  const cls = STATUS_BADGES[status] ?? "bg-gray-100 text-gray-600"
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {STATUS_LABELS[status] ?? status}
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

      {connection.status === "pending_first_sync" && (
        <div className="bg-blue-50 border border-blue-200 rounded-md px-3 py-2 text-xs text-blue-700">
          Import in progress. This connection is authorised but hasn&rsquo;t completed its first
          invoice import yet &mdash; refresh in a minute, or use &ldquo;Sync now&rdquo; below.
        </div>
      )}

      {connection.status === "error" && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-md px-3 py-2 text-xs text-yellow-800">
          The first invoice import didn&rsquo;t complete successfully. Try syncing again &mdash; if it
          keeps failing, contact support.
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {SYNCABLE_STATUSES.has(connection.status) && (
          <button
            onClick={() => onSync(connection.id)}
            disabled={syncing}
            className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {syncing
              ? "Syncing\u2026"
              : connection.status === "error"
              ? "Retry sync"
              : "Sync now"}
          </button>
        )}
        {connection.status === "revoked" && (
          <a
            href={`/api/integrations/${connection.provider}/connect`}
            className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
          >
            Reconnect
          </a>
        )}
        <button
          onClick={() => onDisconnect(connection.id)}
          disabled={disconnecting}
          className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {disconnecting ? "Disconnecting…" : "Disconnect"}
        </button>
        {connection.recentRuns.length > 0 && (
          <button
            onClick={() => setShowHistory((v) => !v)}
            className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
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

function ProviderCard({
  provider,
  connections,
  hasFeature,
  onSync,
  onDisconnect,
  syncingId,
  disconnectingId,
}: {
  provider: ProviderType
  connections: AccountingConnectionRow[]
  hasFeature: boolean
  onSync: (id: string) => void
  onDisconnect: (id: string) => void
  syncingId: string | null
  disconnectingId: string | null
}) {
  const primaryConnection = connections.find((connection) => connection.status !== "disconnected")
  const showDisconnectPrimary = Boolean(primaryConnection)

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-400">
            {PROVIDER_KICKERS[provider]}
          </p>
          <h2 className="text-lg font-semibold text-gray-900">{PROVIDER_LABELS[provider]}</h2>
          <p className="text-sm text-gray-500">{PROVIDER_DESCRIPTIONS[provider]}</p>
        </div>

        {hasFeature ? (
          showDisconnectPrimary && primaryConnection ? (
            <button
              onClick={() => onDisconnect(primaryConnection.id)}
              disabled={disconnectingId === primaryConnection.id}
              className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {disconnectingId === primaryConnection.id
                ? "Disconnecting…"
                : `Disconnect ${PROVIDER_LABELS[provider]}`}
            </button>
          ) : (
            <a
              href={`/api/integrations/${provider}/connect`}
              className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              {`Connect ${PROVIDER_LABELS[provider]}`}
            </a>
          )
        ) : (
          <a
            href="/dashboard/settings/subscription"
            className="inline-flex items-center justify-center rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600"
          >
            Upgrade plan
          </a>
        )}
      </div>

      {!hasFeature ? (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-2">
          <p className="text-sm font-medium text-amber-900">Business plan required</p>
          <p className="text-sm text-amber-800">
            Accounting integrations require the Business plan or above.
          </p>
        </div>
      ) : connections.length > 0 ? (
        <div className="space-y-3">
          {connections.map((connection) => (
            <ConnectionCard
              key={connection.id}
              connection={connection}
              onSync={onSync}
              onDisconnect={onDisconnect}
              syncing={syncingId === connection.id}
              disconnecting={disconnectingId === connection.id}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-5 text-sm text-gray-600">
          No {PROVIDER_LABELS[provider]} connection yet.
        </div>
      )}
    </section>
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
  const xeroConnections = connections.filter((connection) => connection.provider === "xero")
  const myobConnections = connections.filter((connection) => connection.provider === "myob")

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
      <div className="grid gap-5 lg:grid-cols-2">
        <ProviderCard
          provider="xero"
          connections={[]}
          hasFeature={false}
          onSync={handleSync}
          onDisconnect={handleDisconnect}
          syncingId={syncingId}
          disconnectingId={disconnectingId}
        />
        <ProviderCard
          provider="myob"
          connections={[]}
          hasFeature={false}
          onSync={handleSync}
          onDisconnect={handleDisconnect}
          syncingId={syncingId}
          disconnectingId={disconnectingId}
        />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-base font-medium text-gray-900">Accounting Integrations</h2>
        <p className="text-sm text-gray-500">
          Connect your accounting software to automatically import overdue invoices and send
          reminder emails.
        </p>
      </div>

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
            ? "Accounting integrations require the Business plan or above."
            : errorMessage === "xero_cancelled" || errorMessage === "myob_cancelled"
            ? "Connection was cancelled."
            : errorMessage === "no_organisations"
            ? "No organisations found in your account. Ensure you have at least one organisation."
            : `Error: ${errorMessage}`}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <ProviderCard
          provider="xero"
          connections={xeroConnections}
          hasFeature={true}
          onSync={handleSync}
          onDisconnect={handleDisconnect}
          syncingId={syncingId}
          disconnectingId={disconnectingId}
        />
        <ProviderCard
          provider="myob"
          connections={myobConnections}
          hasFeature={true}
          onSync={handleSync}
          onDisconnect={handleDisconnect}
          syncingId={syncingId}
          disconnectingId={disconnectingId}
        />
      </div>
    </div>
  )
}
