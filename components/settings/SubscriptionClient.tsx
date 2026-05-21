"use client"

import { useState } from "react"

export function SubscriptionClient({
  tier,
  status,
  successMessage,
}: {
  tier: "free" | "pro"
  status: string
  successMessage: string | null
}) {
  const [loading, setLoading] = useState(false)

  async function handleUpgrade() {
    setLoading(true)
    const res = await fetch("/api/billing/checkout", { method: "POST" })
    const data = await res.json()
    if (data.url) window.location.href = data.url
    setLoading(false)
  }

  async function handleManage() {
    setLoading(true)
    const res = await fetch("/api/billing/portal", { method: "POST" })
    const data = await res.json()
    if (data.url) window.location.href = data.url
    setLoading(false)
  }

  return (
    <div className="max-w-lg space-y-4">
      <h2 className="text-base font-medium text-gray-900">Subscription</h2>

      {successMessage && (
        <div className="bg-green-50 border border-green-200 rounded-md px-4 py-2 text-sm text-green-800">
          {successMessage}
        </div>
      )}

      <div className="border border-gray-200 rounded-lg p-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-900">
            {tier === "pro" ? "Pro" : "Free"} plan
          </span>
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              tier === "pro"
                ? "bg-blue-100 text-blue-800"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            {tier === "pro" ? "$19/mo" : "Free"}
          </span>
        </div>
        {tier === "free" && (
          <ul className="text-xs text-gray-500 space-y-0.5">
            <li>• Up to 3 active tracked invoices</li>
            <li>• Emails sent from system address</li>
            <li>• Default 3/10/21 day schedule</li>
          </ul>
        )}
        {tier === "pro" && (
          <ul className="text-xs text-gray-500 space-y-0.5">
            <li>• Unlimited tracked invoices</li>
            <li>• Send from your own email address</li>
            <li>• Custom follow-up schedule</li>
          </ul>
        )}
      </div>

      {tier === "free" ? (
        <button
          onClick={handleUpgrade}
          disabled={loading}
          className="bg-blue-600 text-white text-sm px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Loading..." : "Upgrade to Pro — $19/mo"}
        </button>
      ) : (
        <button
          onClick={handleManage}
          disabled={loading}
          className="bg-gray-100 text-gray-800 text-sm px-4 py-2 rounded-md hover:bg-gray-200 disabled:opacity-50"
        >
          {loading ? "Loading..." : "Manage subscription"}
        </button>
      )}
    </div>
  )
}
