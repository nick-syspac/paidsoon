"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Spinner } from "@/components/ui/Spinner"
import { getPublicPlans, type SubscriptionTier } from "@/lib/subscriptionPlans"
import { formatPlanPrice, planHighlights } from "@/lib/planPresentation"

const PUBLIC_PLANS = getPublicPlans()
const VALID_TIERS: SubscriptionTier[] = PUBLIC_PLANS.map((plan) => plan.id)

function getPreselectedTier(): SubscriptionTier {
  try {
    const stored = localStorage.getItem("preselectedPlan")
    localStorage.removeItem("preselectedPlan")
    if (stored && (VALID_TIERS as string[]).includes(stored)) {
      return stored as SubscriptionTier
    }
  } catch {
    // localStorage unavailable (e.g. private browsing restrictions)
  }
  return "starter"
}

export function OnboardingPlanPicker() {
  const router = useRouter()
  const [selectedTier, setSelectedTier] = useState<SubscriptionTier>(getPreselectedTier)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleStart() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/onboarding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: selectedTier }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? "Something went wrong")
        return
      }
      router.push("/dashboard")
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-semibold text-gray-900">Start your 14-day free trial</h1>
        <p className="text-sm text-gray-500">No credit card required. Pick the plan that fits — you can change it anytime.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {PUBLIC_PLANS.map((plan) => {
          const isSelected = selectedTier === plan.id
          return (
            <button
              key={plan.id}
              type="button"
              onClick={() => setSelectedTier(plan.id)}
              className={[
                "relative flex flex-col text-left rounded-xl border-2 p-5 transition-all focus:outline-none focus:ring-2 focus:ring-blue-500",
                isSelected
                  ? "border-blue-600 bg-blue-50"
                  : "border-gray-200 bg-white hover:border-gray-300",
              ].join(" ")}
            >
              {plan.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs font-semibold px-3 py-0.5 rounded-full">
                  Most popular
                </span>
              )}
              <div className="mb-3">
                <p className="text-sm font-semibold text-gray-900">{plan.name}</p>
                <p className="mt-1">
                  <span className="text-2xl font-bold text-gray-900">{formatPlanPrice(plan.monthlyPriceAud)}</span>
                </p>
              </div>
              <ul className="space-y-1.5 flex-1">
                {planHighlights(plan.id).map((h) => (
                  <li key={h} className="flex items-start gap-1.5 text-xs text-gray-600">
                    <span className="mt-0.5 text-green-500 shrink-0">✓</span>
                    {h}
                  </li>
                ))}
              </ul>
              {isSelected && (
                <span className="mt-4 text-xs font-medium text-blue-700">Selected</span>
              )}
            </button>
          )
        })}
      </div>

      {error && <p className="text-sm text-red-600 text-center">{error}</p>}

      <div className="flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={handleStart}
          disabled={loading}
          className="flex items-center gap-2 bg-blue-600 text-white text-sm font-medium px-8 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {loading && <Spinner />}
          {loading ? "Starting trial…" : "Start free trial"}
        </button>
        <p className="text-xs text-gray-400">14 days free · No credit card required · Cancel anytime</p>
      </div>
    </div>
  )
}
