"use client"

import { useState } from "react"
import {
  PLAN_CATALOG,
  PLAN_ORDER,
  getPlanChangeBenefits,
  getPlanChangeImpact,
  resolvePlanSelectorTier,
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
  preselectedTier,
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
  const [confirmingChangeTo, setConfirmingChangeTo] = useState<SubscriptionTier | null>(null)
  const [pendingDowngrade, setPendingDowngrade] = useState<SubscriptionTier | null>(pendingDowngradeTier)
  const [notice, setNotice] = useState<string | null>(null)
  const [selectedTierOverride, setSelectedTierOverride] = useState<SubscriptionTier | null>(null)

  const plan = PLAN_CATALOG[tier]
  const selectedTier = resolvePlanSelectorTier(tier, preselectedTier, selectedTierOverride)
  const pendingPlan = pendingDowngrade ? PLAN_CATALOG[pendingDowngrade] : null
  const confirmingPlan = confirmingChangeTo ? PLAN_CATALOG[confirmingChangeTo] : null
  const isConfirmingDowngrade =
    confirmingChangeTo != null && PLAN_ORDER.indexOf(confirmingChangeTo) < PLAN_ORDER.indexOf(tier)
  const impact = confirmingChangeTo && isConfirmingDowngrade ? getPlanChangeImpact(tier, confirmingChangeTo) : null
  const benefits = confirmingChangeTo && !isConfirmingDowngrade ? getPlanChangeBenefits(tier, confirmingChangeTo) : null
  const planOptions = PLAN_ORDER.filter((planId) => PLAN_CATALOG[planId].visibility === "public").map(
    (planId) => PLAN_CATALOG[planId],
  )

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
    setSelectedTierOverride(targetTier)

    if (targetTier === tier) {
      setConfirmingChangeTo(null)
      return
    }

    setConfirmingChangeTo(targetTier)
  }

  async function confirmPlanChange() {
    if (!confirmingChangeTo) {
      return
    }

    setLoading(true)
    setError(null)
    try {
      if (isConfirmingDowngrade) {
        const res = await fetch("/api/billing/downgrade", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tier: confirmingChangeTo }),
        })
        const data = await res.json()
        if (!res.ok) {
          setError(data.error ?? "Something went wrong. Please try again.")
          return
        }

        setPendingDowngrade(confirmingChangeTo)
        setConfirmingChangeTo(null)
        setNotice(
          data.message ??
            `Your plan will change on ${formatDate(currentPeriodEnd)}. You can cancel before then.`,
        )
        return
      }

      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: confirmingChangeTo }),
      })
      const data = await res.json()
      if (data.url) {
        window.location.assign(data.url)
        return
      }
      setError(data.error ?? "Something went wrong. Please try again.")
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setLoading(false)
    }
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
      setSelectedTierOverride(null)
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
            const isSelected = option.id === selectedTier
            const isPending = pendingDowngrade === option.id
            return (
              <button
                key={option.id}
                onClick={() => handlePlanSelect(option.id)}
                disabled={loading}
                className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                  isSelected
                    ? "border-amber-400 ring-1 ring-amber-300 bg-white text-gray-900"
                    : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    {option.name}
                    {isPending && !isSelected ? (
                      <span className="ml-2 text-xs font-medium text-amber-700">(scheduled)</span>
                    ) : null}
                  </span>
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

      {confirmingChangeTo && confirmingPlan && (impact || benefits) && (
        <div
          className={`rounded-xl border p-4 space-y-3 ${isConfirmingDowngrade ? "border-amber-200 bg-amber-50" : "border-sky-200 bg-sky-50"}`}
        >
          <div>
            <p className={`text-sm font-semibold ${isConfirmingDowngrade ? "text-amber-900" : "text-sky-900"}`}>
              {isConfirmingDowngrade ? "Downgrade" : "Upgrade"} to {confirmingPlan.name}
            </p>
            <p className={`text-sm mt-1 ${isConfirmingDowngrade ? "text-amber-800" : "text-sky-800"}`}>
              {isConfirmingDowngrade
                ? `Your plan will change on ${formatDate(currentPeriodEnd)} and you can cancel before then.`
                : "After you confirm, we will take you to Stripe to complete this upgrade. Your new plan starts immediately and Stripe applies proration."}
            </p>
          </div>

          <div className={`space-y-1 text-sm ${isConfirmingDowngrade ? "text-amber-900" : "text-sky-900"}`}>
            <p className="font-medium">You will {isConfirmingDowngrade ? "lose" : "get"}:</p>
            {isConfirmingDowngrade ? (
              <>
                {impact?.lostFeatures.length ? (
                  <ul className="list-disc pl-5 space-y-1">
                    {impact.lostFeatures.map((feature) => (
                      <li key={feature}>{feature}</li>
                    ))}
                  </ul>
                ) : (
                  <p>No feature changes.</p>
                )}
                {impact?.limitChanges.length ? (
                  <ul className="list-disc pl-5 space-y-1">
                    {impact.limitChanges.map((change) => (
                      <li key={change}>Limits: {change}</li>
                    ))}
                  </ul>
                ) : null}
              </>
            ) : (
              <>
                {benefits?.gainedFeatures.length ? (
                  <ul className="list-disc pl-5 space-y-1">
                    {benefits.gainedFeatures.map((feature) => (
                      <li key={feature}>{feature}</li>
                    ))}
                  </ul>
                ) : (
                  <p>No feature changes.</p>
                )}
                {benefits?.limitChanges.length ? (
                  <ul className="list-disc pl-5 space-y-1">
                    {benefits.limitChanges.map((change) => (
                      <li key={change}>Limits: {change}</li>
                    ))}
                  </ul>
                ) : null}
              </>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={confirmPlanChange}
              disabled={loading}
              className={`rounded-md px-3 py-2 text-sm font-medium text-white disabled:opacity-60 ${isConfirmingDowngrade ? "bg-amber-700" : "bg-sky-700"}`}
            >
              {loading
                ? isConfirmingDowngrade
                  ? "Scheduling…"
                  : "Opening Stripe…"
                : isConfirmingDowngrade
                  ? "Confirm downgrade"
                  : "Continue to Stripe"}
            </button>
            <button
              onClick={() => {
                setConfirmingChangeTo(null)
                setSelectedTierOverride(null)
              }}
              disabled={loading}
              className={`rounded-md border px-3 py-2 text-sm font-medium disabled:opacity-60 ${isConfirmingDowngrade ? "border-amber-300 text-amber-800" : "border-sky-300 text-sky-800"}`}
            >
              Keep current plan
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

