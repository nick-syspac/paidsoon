"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

export function StripeConnectionClient({
  isConnected,
  accountId,
  successMessage,
  errorMessage,
}: {
  isConnected: boolean
  accountId: string | null
  successMessage: string | null
  errorMessage: string | null
}) {
  const router = useRouter()
  const [disconnecting, setDisconnecting] = useState(false)

  async function handleDisconnect() {
    if (!confirm("Disconnect Stripe? Active sequences will be paused.")) return
    setDisconnecting(true)
    await fetch("/api/stripe/connect/disconnect", { method: "POST" })
    setDisconnecting(false)
    router.refresh()
  }

  return (
    <div className="max-w-lg space-y-4">
      <h2 className="text-base font-medium text-gray-900">Stripe Connection</h2>
      <p className="text-sm text-gray-500">
        Connect your Stripe account so PaidSoon can detect overdue invoices automatically.
      </p>

      {successMessage && (
        <div className="bg-green-50 border border-green-200 rounded-md px-4 py-2 text-sm text-green-800">
          {successMessage}
        </div>
      )}
      {errorMessage && (
        <div className="bg-red-50 border border-red-200 rounded-md px-4 py-2 text-sm text-red-700">
          {errorMessage === "connect_cancelled"
            ? "Stripe connection was cancelled."
            : `Error: ${errorMessage}`}
        </div>
      )}

      {isConnected ? (
        <div className="border border-gray-200 rounded-lg p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-900">Connected</p>
            {accountId && (
              <p className="text-xs text-gray-400 mt-0.5">{accountId}</p>
            )}
          </div>
          <button
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="text-sm text-red-600 hover:text-red-800 disabled:opacity-40"
          >
            {disconnecting ? "Disconnecting..." : "Disconnect"}
          </button>
        </div>
      ) : (
        <a
          href="/api/stripe/connect/authorize"
          className="inline-flex items-center gap-2 bg-blue-600 text-white text-sm px-4 py-2 rounded-md hover:bg-blue-700"
        >
          Connect Stripe Account
        </a>
      )}
    </div>
  )
}
