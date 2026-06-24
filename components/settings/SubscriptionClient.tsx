"use client"

import { useState } from "react"
import {
  PLAN_ORDER,
  PLAN_CATALOG,
  type SubscriptionTier,
  type SubscriptionFeature,
} from "@/lib/subscriptionPlans"

const FEATURE_LABELS: Partial<Record<SubscriptionFeature, string>> = {
  ai_rewrite: "AI message rewrite",
  tone_settings: "Tone controls",
  custom_reminder_templates: "Custom reminder templates",
  own_email_address: "Use your own email address",
  email_reminder_sequence: "Full 3-stage email sequence",
  payment_status_dashboard: "Payment status dashboard",
  overdue_invoice_dashboard: "Overdue invoice dashboard",
}

function computeLostFeatures(from: SubscriptionTier, to: SubscriptionTier) {
  const fromPlan = PLAN_CATALOG[from]
  const toPlan = PLAN_CATALOG[to]
  const items: string[] = []

  // Boolean features lost
  for (const [key, label] of Object.entries(FEATURE_LABELS)) {
    const feature = key as SubscriptionFeature
    if (fromPlan.features[feature] && !toPlan.features[feature]) {
      items.push(label as string)
    }
  }

  // Limit reductions
  if (toPlan.limits.chasedInvoicesPerMonth < fromPlan.limits.chasedInvoicesPerMonth) {
    items.push(
      `Chased invoices: ${fromPlan.limits.chasedInvoicesPerMonth}/mo → ${toPlan.limits.chasedInvoicesPerMonth}/mo`,
    )
  }
  if (toPlan.limits.userSeats < fromPlan.limits.userSeats) {
    items.push(`User seats: ${fromPlan.limits.userSeats} → ${toPlan.limits.userSeats}`)
  }
  if (toPlan.limits.connectedStripeAccounts < fromPlan.limits.connectedStripeAccounts) {
    items.push(
      `Connected Stripe accounts: ${fromPlan.limits.connectedStripeAccounts} → ${toPlan.limits.connectedStripeAccounts}`,
    )
  }

  return items
}

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
  pendingDowngradeTier: initialPendingTier,
  successMessage,
}: {
  tier: SubscriptionTier
  status: string
  currentPeriodEnd: Date | null
  pendingDowngradeTier: SubscriptionTier | null
  successMessage: string | null
}) {
  const [loading, setLoading] = useState(false)
  const [pendingTier, setPendingTier] = useState<SubscriptionTier | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmingDowngradeTo, setConfirmingDowngradeTo] = useState<SubscriptionTier | null>(null)
  const [pendingDowngrade, setPendingDowngrade] = useState<{
    tier: SubscriptionTier
    scheduledAt: string
  } | null>(
    initialPendingTier && currentPeriodEnd
      ? { tier: initialPendingTier, scheduledAt: currentPeriodEnd.toString() }
      : null,
  )

  async function handlePlanClick(selectedTier: SubscriptionTier) {
    const currentIndex = PLAN_ORDER.indexOf(tier)
    const selectedIndex = PLAN_ORDER.indexOf(selectedTier)

    if (selectedIndex < currentIndex) {
      // Downgrade — show confirmation panel
      setConfirmingDowngradeTo(selectedTier)
      return
    }

    // Upgrade — call checkout route
    setLoading(true)
    setPendingTier(selectedTier)
    setError(null)
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: selectedTier }),
      })
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
    setPendingTier(null)
  }

  async function handleConfirmDowngrade() {
    if (!confirmingDowngradeTo) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/billing/downgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: confirmingDowngradeTo }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "Failed to schedule downgrade.")
        setLoading(false)
        return
      }
      setPendingDowngrade({ tier: confirmingDowngradeTo, scheduledAt: data.scheduledAt })
      setConfirmingDowngradeTo(null)
    } catch {
      setError("Something went wrong. Please try again.")
    }
    setLoading(false)
  }

  async function handleCancelDowngrade() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/billing/downgrade", { method: "DELETE" })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "Failed to cancel downgrade.")
        setLoading(false)
        return
      }
      setPendingDowngrade(null)
    } catch {
      setError("Something went wrong. Please try again.")
    }
    setLoading(false)
  }

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

  if (confirmingDowngradeTo) {
    const lostFeatures = computeLostFeatures(tier, confirmingDowngradeTo)
    const targetPlan = PLAN_CATALOG[confirmingDowngradeTo]

    return (
      <div className="max-w-lg space-y-4">
        <h2 className="text-base font-medium text-gray-900">Downgrade to {targetPlan.name}</h2>

        <div className="border border-amber-200 bg-amber-50 rounded-lg p-4 space-y-3">
          <p className="text-sm text-amber-900">
            Your <span className="font-medium">{PLAN_CATALOG[tier].name}</span> plan continues
            until{" "}
            <span className="font-medium">
              {currentPeriodEnd ? formatDate(currentPeriodEnd) : "your next renewal date"}
            </span>
            . After that, your account switches to {targetPlan.name}.
          </p>

          {lostFeatures.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide mb-1">
                You will lose access to
              </p>
              <ul className="space-y-0.5">
                {lostFeatures.map((f) => (
                  <li key={f} className="text-sm text-amber-900">
                    • {f}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-md px-4 py-2 text-sm text-red-800">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={handleConfirmDowngrade}
            disabled={loading}
            className="bg-red-600 text-white text-sm px-4 py-2 rounded-md hover:bg-red-700 disabled:opacity-50"
          >
            {loading ? "Scheduling…" : `Confirm downgrade to ${targetPlan.name}`}
          </button>
          <button
            onClick={() => { setConfirmingDowngradeTo(null); setError(null) }}
            disabled={loading}
            className="bg-gray-100 text-gray-800 text-sm px-4 py-2 rounded-md hover:bg-gray-200 disabled:opacity-50"
          >
            Keep current plan
          </button>
        </div>
      </div>
    )
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

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md px-4 py-2 text-sm text-red-800">
          {error}
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
                  A${plan.monthlyPriceAud}/mo
                </span>
              </div>
              <ul className="text-xs text-gray-600 space-y-0.5">
                <li>• {plan.limits.chasedInvoicesPerMonth} chased invoices/month</li>
                <li>• {plan.limits.userSeats} user seat{plan.limits.userSeats > 1 ? "s" : ""}</li>
                <li>
                  • {plan.limits.connectedStripeAccounts} connected Stripe account
                  {plan.limits.connectedStripeAccounts > 1 ? "s" : ""}
                </li>
                {plan.features.own_email_address && <li>• Use your own email address</li>}
                {plan.features.custom_reminder_templates && <li>• Custom reminder templates</li>}
                {plan.features.ai_rewrite && <li>• AI message rewrite</li>}
              </ul>

              {isCurrent ? (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-blue-700">Current plan</p>
                  {currentPeriodEnd && !pendingDowngrade && (
                    <p className="text-xs text-gray-500">Renews {formatDate(currentPeriodEnd)}</p>
                  )}
                  {pendingDowngrade && (
                    <div className="space-y-1">
                      <p className="text-xs text-amber-700 font-medium">
                        Downgrading to {PLAN_CATALOG[pendingDowngrade.tier].name} on{" "}
                        {formatDate(pendingDowngrade.scheduledAt)}
                      </p>
                      <button
                        onClick={handleCancelDowngrade}
                        disabled={loading}
                        className="text-xs text-red-600 hover:underline disabled:opacity-50"
                      >
                        {loading ? "Cancelling…" : "Cancel scheduled downgrade"}
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => handlePlanClick(plan.id)}
                  disabled={loading}
                  className="bg-blue-600 text-white text-sm px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading && pendingTier === plan.id ? "Loading…" : `Switch to ${plan.name}`}
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
        {loading && !pendingTier ? "Loading…" : "Manage subscription"}
      </button>
    </div>
  )
}
