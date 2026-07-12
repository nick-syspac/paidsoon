"use client"

import { useState } from "react"

/**
 * Client-driven Stripe Checkout kickoff. Deliberately requires an explicit
 * user click before creating a Checkout session and redirecting — the
 * previous /billing/checkout page created a session and redirected
 * automatically on every server render, which meant Stripe's cancel_url
 * (which points back under /dashboard/**) re-entered the trial-expired
 * gate in app/dashboard/layout.tsx and immediately bounced back into a new
 * Checkout session, producing an inescapable redirect loop. Requiring a
 * click here breaks that loop: landing on this page is now a static stop,
 * not another hop.
 */
export function StartCheckoutButton({ tier }: { tier: string }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleClick() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      })
      const data: unknown = await res.json()
      const url =
        typeof data === "object" && data !== null && "url" in data
          ? (data as Record<string, unknown>).url
          : undefined

      if (res.ok && typeof url === "string") {
        window.location.href = url
        return
      }

      const message =
        typeof data === "object" && data !== null && "error" in data
          ? (data as Record<string, unknown>).error
          : undefined
      setError(typeof message === "string" ? message : "Something went wrong while setting up your subscription.")
    } catch {
      setError("Could not connect to the billing service. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      <button
        onClick={handleClick}
        disabled={loading}
        className="w-full bg-blue-600 text-white text-sm font-medium px-4 py-2.5 rounded-md hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? "Redirecting to secure checkout…" : "Continue to Subscribe"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
