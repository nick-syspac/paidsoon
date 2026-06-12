"use client"

import { useState } from "react"
import { PLAN_ORDER, PLAN_CATALOG, type SubscriptionTier } from "@/lib/subscriptionPlans"

export function SubscriptionClient({
  tier,
  status,
  successMessage,
}: {
  tier: SubscriptionTier
  status: string
  successMessage: string | null
}) {
  const [loading, setLoading] = useState(false)
  const [pendingTier, setPendingTier] = useState<SubscriptionTier | null>(null)

  async function handleCheckout(selectedTier: SubscriptionTier) {
    setLoading(true)
    setPendingTier(selectedTier)
    const res = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tier: selectedTier }),
    })
    const data = await res.json()
    if (data.url) window.location.href = data.url
    setLoading(false)
    setPendingTier(null)
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
      <p className="text-sm text-gray-500">
        Current billing status: <span className="font-medium text-gray-700">{status}</span>
      </p>

      {successMessage && (
        <div className="bg-green-50 border border-green-200 rounded-md px-4 py-2 text-sm text-green-800">
          {successMessage}
        </div>
      )}

      <div className="space-y-3">
        {PLAN_ORDER.map((planId) => {
          const plan = PLAN_CATALOG[planId]
          const isCurrent = tier === planId
          return (
            <div
              key={plan.id}
              className={`border rounded-lg p-4 space-y-2 ${
                isCurrent ? "border-blue-300 bg-blue-50/50" : "border-gray-200"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-900">{plan.name}</span>
                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-700">
                  ${plan.monthlyPriceUsd}/mo
                </span>
              </div>
              <ul className="text-xs text-gray-600 space-y-0.5">
                <li>• {plan.limits.chasedInvoicesPerMonth} chased invoices/month</li>
                <li>• {plan.limits.userSeats} user seat{plan.limits.userSeats > 1 ? "s" : ""}</li>
                <li>• {plan.limits.connectedStripeAccounts} connected Stripe account{plan.limits.connectedStripeAccounts > 1 ? "s" : ""}</li>
                {plan.features.own_email_address && <li>• Use your own email address</li>}
                {plan.features.custom_reminder_templates && <li>• Custom reminder templates</li>}
                {plan.features.ai_rewrite && <li>• Basic AI rewrite support</li>}
              </ul>
              {isCurrent ? (
                <p className="text-xs font-medium text-blue-700">Current plan</p>
              ) : (
                <button
                  onClick={() => handleCheckout(plan.id)}
                  disabled={loading}
                  className="bg-blue-600 text-white text-sm px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading && pendingTier === plan.id
                    ? "Loading..."
                    : `Switch to ${plan.name}`}
                </button>
              )}
            </div>
          )
        })}
      </div>

      <button
        onClick={handleManage}
        disabled={loading}
        className="bg-gray-100 text-gray-800 text-sm px-4 py-2 rounded-md hover:bg-gray-200 disabled:opacity-50"
      >
        {loading && !pendingTier ? "Loading..." : "Manage subscription"}
      </button>
    </div>
  )
}
