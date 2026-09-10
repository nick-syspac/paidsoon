"use client"

import { useMemo, useState } from "react"
import type { SubscriptionTier } from "@/lib/subscriptionPlans"

interface PricingIntent {
  id: string
  label: string
  recommendedTier: SubscriptionTier
  reason: string
}

const INTENTS: PricingIntent[] = [
  {
    id: "get-paid",
    label: "I need to get invoices paid",
    recommendedTier: "starter",
    reason: "Essentials gives you a practical receivables and committed-cash starting point.",
  },
  {
    id: "reduce-spend",
    label: "I want to reduce unnecessary spending",
    recommendedTier: "solo",
    reason: "Solo adds stronger visibility across recurring spend, owner summaries, and control signals.",
  },
  {
    id: "cash-visibility",
    label: "I need better cash visibility",
    recommendedTier: "small_business",
    reason: "Small Business is the complete financial-control suite for growing teams.",
  },
  {
    id: "complete-control",
    label: "I want the complete control platform",
    recommendedTier: "business_pro",
    reason: "Business Pro is built for higher capacity and advanced control scenarios.",
  },
]

export function PricingIntentSelector({
  planNames,
}: {
  planNames: Record<SubscriptionTier, string>
}) {
  const [selectedIntentId, setSelectedIntentId] = useState<string>(INTENTS[0].id)

  const selectedIntent = useMemo(
    () => INTENTS.find((intent) => intent.id === selectedIntentId) ?? INTENTS[0],
    [selectedIntentId],
  )

  return (
    <section className="max-w-5xl mx-auto px-4 pb-10">
      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-6">
        <h2 className="text-xl font-semibold text-gray-900">What are you trying to control first?</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {INTENTS.map((intent) => {
            const selected = intent.id === selectedIntentId
            return (
              <button
                key={intent.id}
                type="button"
                className={`rounded-lg border px-4 py-3 text-left text-sm transition ${
                  selected
                    ? "border-blue-600 bg-blue-50 text-blue-900"
                    : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                }`}
                onClick={() => setSelectedIntentId(intent.id)}
              >
                {intent.label}
              </button>
            )
          })}
        </div>
        <p className="mt-4 text-sm text-gray-700">
          Recommended starting point: <span className="font-semibold">{planNames[selectedIntent.recommendedTier]}</span>
        </p>
        <p className="mt-1 text-sm text-gray-600">{selectedIntent.reason}</p>
      </div>
    </section>
  )
}
