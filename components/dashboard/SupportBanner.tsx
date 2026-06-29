"use client"

import { useSearchParams, useRouter } from "next/navigation"
import { Suspense } from "react"

function SupportBannerInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const isSupportView = searchParams.get("support_view") === "true"
  const supportSession = searchParams.get("support_session")

  if (!isSupportView || !supportSession) return null

  async function endSession() {
    try {
      const resp = await fetch("/api/admin/impersonation/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })

      if (resp.ok) {
        const data = await resp.json()
        if (data.redirectUrl) {
          router.push(data.redirectUrl)
        } else {
          router.push("/admin/customers")
        }
      }
    } catch {
      // Redirect even if the API fails
      router.push("/admin/customers")
    }
  }

  return (
    <div className="bg-amber-500 text-amber-950 px-4 py-2 text-sm font-medium flex items-center justify-between">
      <span>
        ⚠️ <strong>Support Mode: Read-only view.</strong> All actions are monitored and logged.
      </span>
      <button
        onClick={endSession}
        className="bg-amber-700 hover:bg-amber-800 text-amber-100 px-3 py-1 rounded text-xs font-semibold transition-colors"
      >
        End Support Session
      </button>
    </div>
  )
}

/**
 * Renders a prominent orange banner when a support staff member is viewing
 * a customer's dashboard in read-only mode (support_view=true query param).
 */
export function SupportBanner() {
  return (
    <Suspense fallback={null}>
      <SupportBannerInner />
    </Suspense>
  )
}
