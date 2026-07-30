"use client"

import { useState } from "react"

export function UpgradeBanner({
  usage,
  allowance,
  periodEnd,
  tierName,
  atCapacity,
}: {
  usage: number
  allowance: number
  periodEnd: Date
  tierName: string
  atCapacity: boolean
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

  const resetDate = new Date(periodEnd).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
  })

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-center justify-between gap-4">
      <div>
        {atCapacity ? (
          <>
            <p className="text-sm font-medium text-amber-900">
              You&apos;ve used all {allowance} chases in your {tierName} plan this period.
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              New chases resume on {resetDate}. Reminders already under way keep sending.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-medium text-amber-900">
              You&apos;ve used {usage} of {allowance} chases in your {tierName} plan this period.
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              Resets {resetDate}. Upgrade to unlock higher monthly volume.
            </p>
          </>
        )}
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

