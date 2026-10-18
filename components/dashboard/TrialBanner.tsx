"use client"

import Link from "next/link"
import type { ApplicationAccessPresentation } from "@/lib/subscriptionStatusPresentation"

interface TrialBannerProps {
  presentation: ApplicationAccessPresentation
  checkoutUrl: string
}

export function TrialBanner({ presentation, checkoutUrl }: TrialBannerProps) {
  return (
    <div className="bg-blue-600 text-white text-sm px-4 py-2.5 flex items-center justify-center gap-4">
      <div>
        <p className="font-medium">{presentation.headline}</p>
        <p>{presentation.description}</p>
        {presentation.continuity && <p>{presentation.continuity}</p>}
      </div>
      <Link
        href={checkoutUrl}
        className="underline underline-offset-2 font-medium hover:no-underline whitespace-nowrap"
      >
        Review billing →
      </Link>
    </div>
  )
}
