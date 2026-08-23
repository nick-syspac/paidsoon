"use client"

import { useSearchParams, useRouter } from "next/navigation"
import { Suspense } from "react"
import { useCallback, useEffect, useRef, useState } from "react"

const SESSION_IDLE_TIMEOUT_MS = 60 * 60 * 1000

function SupportBannerInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const isSupportView = searchParams.get("support_view") === "true"
  const supportSession = searchParams.get("support_session")
  const [timingOut, setTimingOut] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const endSession = useCallback(async (reason: "manual" | "timeout") => {
    if (reason === "timeout") {
      setTimingOut(true)
    }

    try {
      const resp = await fetch("/api/admin/impersonation/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
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
  }, [router])

  useEffect(() => {
    if (!isSupportView || !supportSession) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }

      return
    }

    const resetTimeout = () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => {
        void endSession("timeout")
      }, SESSION_IDLE_TIMEOUT_MS)
    }

    const activityEvents: Array<keyof WindowEventMap> = [
      "click",
      "keydown",
      "mousemove",
      "scroll",
      "touchstart",
    ]

    for (const eventName of activityEvents) {
      window.addEventListener(eventName, resetTimeout, { passive: true })
    }

    resetTimeout()

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      for (const eventName of activityEvents) {
        window.removeEventListener(eventName, resetTimeout)
      }
    }
  }, [endSession, isSupportView, supportSession])

  if (!isSupportView || !supportSession) return null

  return (
    <div className="bg-amber-500 text-amber-950 px-4 py-2 text-sm font-medium flex items-center justify-between">
      <span>
        ⚠️ <strong>Support Mode: Read-only view.</strong> All actions are monitored and logged.
      </span>
      <button
        onClick={() => void endSession("manual")}
        disabled={timingOut}
        className="bg-amber-700 hover:bg-amber-800 text-amber-100 px-3 py-1 rounded text-xs font-semibold transition-colors"
      >
        {timingOut ? "Session timing out..." : "End Support Session"}
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
