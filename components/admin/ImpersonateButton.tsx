"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

interface ImpersonateButtonProps {
  userId: string
}

/**
 * Button that starts a customer support session via the impersonation API
 * and follows the redirect URL returned by the server.
 */
export function ImpersonateButton({ userId }: ImpersonateButtonProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function handleClick() {
    setLoading(true)
    setError(null)

    try {
      const resp = await fetch("/api/admin/impersonation/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, notifyCustomer: false }),
      })

      if (!resp.ok) {
        const body = await resp.json()
        throw new Error(body.error || `HTTP ${resp.status}`)
      }

      const data = await resp.json()
      if (data.redirectUrl) {
        router.push(data.redirectUrl)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start support session")
      setLoading(false)
    }
  }

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={loading}
        className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white px-4 py-2 rounded text-sm transition-colors"
      >
        {loading ? "Starting…" : "View as Customer"}
      </button>
      {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
    </div>
  )
}
