"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

export function UpgradeBanner({
  trackedCount,
  userId,
}: {
  trackedCount: number
  userId: string
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleUpgrade() {
    setLoading(true)
    const res = await fetch("/api/billing/checkout", { method: "POST" })
    const data = await res.json()
    if (data.url) {
      window.location.href = data.url
    }
    setLoading(false)
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-amber-900">
          You&apos;ve reached the free tier limit ({trackedCount}/3 invoices tracked).
        </p>
        <p className="text-xs text-amber-700 mt-0.5">
          Upgrade to Pro to track unlimited invoices and use your own email address.
        </p>
      </div>
      <button
        onClick={handleUpgrade}
        disabled={loading}
        className="shrink-0 bg-amber-600 text-white text-sm px-3 py-1.5 rounded-md hover:bg-amber-700 disabled:opacity-50"
      >
        {loading ? "Loading..." : "Upgrade to Pro — $19/mo"}
      </button>
    </div>
  )
}
