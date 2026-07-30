"use client"

import { useState } from "react"
import {
  PLAN_CATALOG,
  type SubscriptionTier,
} from "@/lib/subscriptionPlans"

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

export function SubscriptionClient({
  tier,
  status,
  currentPeriodEnd,
  successMessage,
}: {
  tier: SubscriptionTier
  status: string
  currentPeriodEnd: Date | null
  pendingDowngradeTier: SubscriptionTier | null
  preselectedTier?: SubscriptionTier
  successMessage: string | null
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const plan = PLAN_CATALOG[tier]

  async function handleManage() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
        return
      }
      setError(data.error ?? "Something went wrong. Please try again.")
    } catch {
      setError("Something went wrong. Please try again.")
    }
    setLoading(false)
  }

  return (
    <div className="max-w-lg space-y-6">
      {successMessage && (
        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-800">
          {successMessage}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="border border-gray-200 rounded-xl p-5 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
              Current plan
            </p>
            <p className="text-xl font-bold text-gray-900">{plan.name}</p>
            <p className="text-sm text-gray-500 mt-0.5">
              {plan.monthlyPriceAud != null && plan.monthlyPriceAud > 0
                ? `$${plan.monthlyPriceAud}/month`
                : plan.monthlyPriceAud === null
                  ? "Contact us"
                  : "Free trial"}
            </p>
          </div>
          <span
            className={`text-xs px-2.5 py-1 rounded-full font-medium ${
              status === "active"
                ? "bg-green-50 text-green-700"
                : "bg-amber-50 text-amber-700"
            }`}
          >
            {status === "active" ? "Active" : status}
          </span>
        </div>

        {currentPeriodEnd && (
          <p className="text-sm text-gray-500">
            Next billing date: {formatDate(currentPeriodEnd)}
          </p>
        )}

        <button
          onClick={handleManage}
          disabled={loading}
          className="w-full border border-gray-200 text-gray-700 text-sm py-2 rounded-md hover:bg-gray-50 disabled:opacity-60 transition-colors"
        >
          {loading ? "Opening…" : "Manage billing →"}
        </button>
      </div>

      <div className="text-sm text-gray-500 bg-gray-50 rounded-lg px-4 py-3">
        To change your plan, contact{" "}
        <a href="mailto:support@paidsoon.com.au" className="text-blue-600 hover:underline">
          support@paidsoon.com.au
        </a>
        {" "}and we will update it for you.
      </div>
    </div>
  )
}



