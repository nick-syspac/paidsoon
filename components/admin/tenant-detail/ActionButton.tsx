"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import type { DiagnosticAction } from "@/lib/admin/diagnostics/types"

interface Props {
  tenantUserId: string
  action: DiagnosticAction
}

export function ActionButton({ tenantUserId, action }: Props) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConfirm() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/admin/tenants/${tenantUserId}/actions/${action.actionSlug}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(action.payload ?? {}),
        }
      )
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError((data as Record<string, string>).error ?? "Action failed")
        setLoading(false)
        return
      }
      setConfirming(false)
      router.refresh()
    } catch {
      setError("Network error — please try again")
      setLoading(false)
    }
  }

  if (confirming) {
    return (
      <div className="mt-2 p-3 bg-gray-800 border border-gray-700 rounded text-sm">
        <p className="text-gray-300 mb-2">{action.description}</p>
        {error && <p className="text-red-400 text-xs mb-2">{error}</p>}
        <div className="flex gap-2">
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white text-xs px-3 py-1.5 rounded"
          >
            {loading ? "Processing…" : "Confirm"}
          </button>
          <button
            onClick={() => { setConfirming(false); setError(null) }}
            disabled={loading}
            className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-300 text-xs px-3 py-1.5 rounded"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="mt-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 text-xs px-3 py-1.5 rounded"
    >
      {action.label}
    </button>
  )
}
