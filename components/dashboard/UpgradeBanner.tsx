"use client"

import { useState } from "react"

export function UpgradeBanner({
  trackedCount,
  tierName,
  tierLimit,
}: {
  trackedCount: number
  tierName: string
  tierLimit: number
}) {
  const [loading, setLoading] = useState(false)

  async function handleUpgrade() {
    setLoading(true)
    const res = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tier: "solo" }),
    })
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
          You&apos;ve reached your {tierName} plan limit ({trackedCount}/{tierLimit} invoices tracked).
        </p>
        <p className="text-xs text-amber-700 mt-0.5">
          Upgrade to unlock higher monthly volume and advanced reminder capabilities.
        </p>
      </div>
      <button
        onClick={handleUpgrade}
        disabled={loading}
        className="shrink-0 bg-amber-600 text-white text-sm px-3 py-1.5 rounded-md hover:bg-amber-700 disabled:opacity-50"
      >
        {loading ? "Loading..." : "Upgrade to Solo — $19/mo"}
      </button>
    </div>
  )
}
