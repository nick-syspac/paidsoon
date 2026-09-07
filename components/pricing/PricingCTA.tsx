"use client"

import { useRouter } from "next/navigation"
import { track } from "@vercel/analytics"
import type { SubscriptionTier } from "@/lib/subscriptionPlans"

interface PricingCTAProps {
  tier: SubscriptionTier
  label: string
  featured?: boolean
  href?: string
  liveMode?: boolean
}

export function PricingCTA({ tier, label, featured, href = "/sign-up", liveMode }: PricingCTAProps) {
  const router = useRouter()

  function handleClick() {
    void track("marketing_plan_select_clicked", {
      tier,
      liveMode: liveMode === undefined ? "unknown" : String(liveMode),
      destination: href,
    })

    if (href === "/sign-up") {
      localStorage.setItem("preselectedPlan", tier)
    }

    router.push(href)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`w-full text-center text-sm py-2 rounded-md ${
        featured
          ? "bg-blue-600 text-white hover:bg-blue-700"
          : "border border-gray-300 text-gray-700 hover:bg-gray-50"
      }`}
    >
      {label}
    </button>
  )
}
