"use client"

import { useRouter } from "next/navigation"
import type { SubscriptionTier } from "@/lib/subscriptionPlans"

interface PricingCTAProps {
  tier: SubscriptionTier
  label: string
  featured?: boolean
}

export function PricingCTA({ tier, label, featured }: PricingCTAProps) {
  const router = useRouter()

  function handleClick() {
    localStorage.setItem("preselectedPlan", tier)
    router.push("/sign-up")
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
