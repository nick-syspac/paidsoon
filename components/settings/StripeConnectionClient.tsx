"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

export function StripeConnectionClient({
  connections,
  maxConnections,
  successMessage,
  errorMessage,
}: {
  connections: Array<{ id: string; accountId: string | null }>
  maxConnections: number
  successMessage: string | null
  errorMessage: string | null
}) {
  const router = useRouter()
  const [disconnecting, setDisconnecting] = useState(false)
  const connectedCount = connections.length
  const canConnectMore = connectedCount < maxConnections

  async function handleDisconnect(connectionId: string) {
    if (!confirm("Disconnect Stripe? Active sequences will be paused.")) return
    setDisconnecting(true)
    await fetch("/api/stripe/connect/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionId }),
    })
    setDisconnecting(false)
    router.refresh()
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-400">
            Payments
          </p>
          <h2 className="text-lg font-semibold text-gray-900">Stripe</h2>
          <p className="text-sm text-gray-500">
            Connect your Stripe account so PaidSoon can detect overdue invoices automatically.
          </p>
        </div>
        <div className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
          {connectedCount}/{maxConnections} connected
        </div>
      </div>

      {successMessage && (
        <div className="bg-green-50 border border-green-200 rounded-md px-4 py-2 text-sm text-green-800">
          {successMessage}
        </div>
      )}
      {errorMessage && (
        <div className="bg-red-50 border border-red-200 rounded-md px-4 py-2 text-sm text-red-700">
          {errorMessage === "connect_cancelled"
            ? "Stripe connection was cancelled."
            : errorMessage === "connection_limit_reached"
            ? "You have reached your current plan limit for connected Stripe accounts."
            : `Error: ${errorMessage}`}
        </div>
      )}

      {connections.length > 0 && (
        <div className="space-y-2">
          {connections.map((connection) => (
            <div
              key={connection.id}
              className="rounded-xl border border-gray-200 bg-gray-50 p-4 flex items-center justify-between gap-4"
            >
              <div>
                <p className="text-sm font-medium text-gray-900">Connected</p>
                {connection.accountId && (
                  <p className="text-xs text-gray-400 mt-0.5">{connection.accountId}</p>
                )}
              </div>
              <button
                onClick={() => handleDisconnect(connection.id)}
                disabled={disconnecting}
                className="inline-flex items-center gap-2 bg-blue-600 text-white text-sm px-3 py-1.5 rounded-md hover:bg-blue-700 disabled:opacity-40"
              >
                {disconnecting ? "Disconnecting..." : "Disconnect"}
              </button>
            </div>
          ))}
        </div>
      )}

      {canConnectMore ? (
        <a
          href="/api/stripe/connect/authorize"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          {connectedCount > 0 ? "Connect another Stripe account" : "Connect Stripe"}
        </a>
      ) : (
        <div className="bg-gray-50 border border-gray-200 rounded-md px-4 py-3 text-sm text-gray-600">
          You&apos;ve reached your plan limit for Stripe connections. Upgrade your subscription to connect more accounts.
        </div>
      )}
    </section>
  )
}
