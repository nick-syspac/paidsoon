"use client"

import Link from "next/link"

interface TrialBannerProps {
  daysRemaining: number
  checkoutUrl: string
}

export function TrialBanner({ daysRemaining, checkoutUrl }: TrialBannerProps) {
  const label =
    daysRemaining <= 1
      ? "Your free trial ends today"
      : `${daysRemaining} days left in your free trial`

  return (
    <div className="bg-blue-600 text-white text-sm px-4 py-2.5 flex items-center justify-center gap-4">
      <span>{label}</span>
      <Link
        href={checkoutUrl}
        className="underline underline-offset-2 font-medium hover:no-underline whitespace-nowrap"
      >
        Add payment to continue →
      </Link>
    </div>
  )
}
