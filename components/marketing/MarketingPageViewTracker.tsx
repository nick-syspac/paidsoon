"use client"

import { useEffect } from "react"
import { track } from "@vercel/analytics"

export function MarketingPageViewTracker({ page }: { page: string }) {
  useEffect(() => {
    void track("marketing_page_viewed", { page })
  }, [page])

  return null
}
