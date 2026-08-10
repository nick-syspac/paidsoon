"use client"

import { useState } from "react"
import {
  PLAN_CATALOG,
  PLAN_ORDER,
  getPlanChangeImpact,
  type SubscriptionTier,
} from "@/lib/subscriptionPlans"

function formatDate(date: Date | string | number | null | undefined): string {
  if (!date) return ""
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
  pendingDowngradeTier,
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
  const [confirmingDowngradeTo, setConfirmingDowngradeTo] = useState<SubscriptionTier | null>(null)
  const [pendingDowngrade, setPendingDowngrade] = useState<SubscriptionTier | null>(pendingDowngradeTier)
  const [notice, setNotice] = useState<string | null>(null)

  const plan = PLAN_CATALOG[tier]
  const pendingPlan = pendingDowngrade ? PLAN_CATALOG[pendingDowngrade] : null
  const confirmingPlan = confirmingDowngradeTo ? PLAN_CATALOG[confirmingDowngradeTo] : null
  const impact = confirmingDowngradeTo ? getPlanChangeImpact(tier, confirmingDowngradeTo) : null
  const planOptions = Object.values(PLAN_CATALOG).filter((plan) => plan.visibility === "public")

  async function handleManage() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" })
      const data = await res.json()
      if (data.url) {
        window.location.assign(data.url)
        return
      }
      setError(data.error ?? "Something went wrong. Please try again.")
    } catch {
      setError("Something went wrong. Please try again.")
    }
    setLoading(false)
  }

  async function handlePlanSelect(targetTier: SubscriptionTier) {
    if (targetTier === tier) {
      return
    }

    if (PLAN_ORDER.indexOf(targetTier) < PLAN_ORDER.indexOf(tier)) {
      setConfirmingDowngradeTo(targetTier)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: targetTier }),
      })
      const data = await res.json()
      if (data.url) {
        window.location.assign(data.url)
        return
      }
      setError(data.error ?? "Something went wrong. Please try again.")
    } catch {
      setError("Something went wrong. Please try again.")
    }
    setLoading(false)
  }

  async function confirmDowngrade() {
    if (!confirmingDowngradeTo) {
      return
    }

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
        setError(data.error ?? "Something went wrong. Please try again.")
        return
      }

      setPendingDowngrade(confirmingDowngradeTo)
      setConfirmingDowngradeTo(null)
      setNotice(
        data.message ??
          `Your plan will change on ${formatDate(currentPeriodEnd)}. You can cancel before then.`,
      )
    } catch {
      setError("Something went wrong. Please try again.")
    }
    setLoading(false)
  }

  async function cancelPendingDowngrade() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/billing/downgrade", { method: "DELETE" })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.")
        return
      }
      setPendingDowngrade(null)
      setNotice(null)
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

      {notice && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-800">
          {notice}
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
          <p className="text-sm text-gray-500">Next billing date: {formatDate(currentPeriodEnd)}</p>
        )}

        {pendingDowngrade && pendingPlan && currentPeriodEnd && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <p className="font-semibold">
              Downgrading to {pendingPlan.name} on {formatDate(currentPeriodEnd)}
            </p>
            <p className="mt-1">Your plan will change at the next renewal. You can cancel before then.</p>
            <button
              onClick={cancelPendingDowngrade}
              disabled={loading}
              className="mt-3 text-sm font-medium text-amber-800 underline disabled:opacity-60"
            >
              {loading ? "Working…" : "Cancel scheduled downgrade"}
            </button>
          </div>
        )}

        <div className="space-y-2">
          {planOptions.map((option) => {
            const isCurrent = option.id === tier
            const isPending = pendingDowngrade === option.id
            return (
              <button
                key={option.id}
                onClick={() => handlePlanSelect(option.id)}
                disabled={loading || isCurrent}
                className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                  isCurrent
                    ? "border-gray-200 bg-gray-50 text-gray-500"
                    : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                } ${isPending ? "ring-2 ring-amber-300" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{option.name}</span>
                  <span className="text-gray-500">
                    {option.monthlyPriceAud != null && option.monthlyPriceAud > 0
                      ? `$${option.monthlyPriceAud}/month`
                      : option.monthlyPriceAud === null
                        ? "Contact us"
                        : "Free trial"}
                  </span>
                </div>
              </button>
            )
          })}
        </div>

        <button
          onClick={handleManage}
          disabled={loading}
          className="w-full border border-gray-200 text-gray-700 text-sm py-2 rounded-md hover:bg-gray-50 disabled:opacity-60 transition-colors"
        >
          {loading ? "Opening…" : "Manage billing →"}
        </button>
      </div>

      {confirmingDowngradeTo && confirmingPlan && impact && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
          <div>
            <p className="text-sm font-semibold text-amber-900">Downgrade to {confirmingPlan.name}</p>
            <p className="text-sm text-amber-800 mt-1">
              Your plan will change on {formatDate(currentPeriodEnd)} and you can cancel before then.
            </p>
          </div>

          <div className="space-y-1 text-sm text-amber-900">
            <p className="font-medium">You will lose:</p>
            {impact.lostFeatures.length > 0 ? (
              <ul className="list-disc pl-5 space-y-1">
                {impact.lostFeatures.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
            ) : (
              <p>No feature changes.</p>
            )}
            {impact.limitChanges.length > 0 && (
              <ul className="list-disc pl-5 space-y-1">
                {impact.limitChanges.map((change) => (
                  <li key={change}>Limits: {change}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={confirmDowngrade}
              disabled={loading}
              className="rounded-md bg-amber-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {loading ? "Scheduling…" : "Confirm downgrade"}
            </button>
            <button
              onClick={() => setConfirmingDowngradeTo(null)}
              disabled={loading}
              className="rounded-md border border-amber-300 px-3 py-2 text-sm font-medium text-amber-800 disabled:opacity-60"
            >
              Keep current plan
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

