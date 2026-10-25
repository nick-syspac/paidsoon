"use client"

import { useEffect } from "react"

import { shouldConfirmLeaveSettings } from "@/lib/settings/unsavedNavigation"

const DEFAULT_CONFIRMATION_MESSAGE = "You have unsaved changes. Leave this page without saving?"

interface UseUnsavedChangesGuardOptions {
  hasUnsavedChanges: boolean
  message?: string
}

export function useUnsavedChangesGuard(options: UseUnsavedChangesGuardOptions): void {
  const { hasUnsavedChanges, message = DEFAULT_CONFIRMATION_MESSAGE } = options

  useEffect(() => {
    if (!hasUnsavedChanges || typeof window === "undefined") return

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = message
    }

    const handleAnchorClick = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return

      const anchor = target.closest("a[href]")
      if (!(anchor instanceof HTMLAnchorElement)) return
      if (!shouldConfirmLeaveSettings(hasUnsavedChanges, anchor.href, window.location.origin)) return
      if (anchor.getAttribute("target") === "_blank") return

      const shouldLeave = window.confirm(message)
      if (!shouldLeave) {
        event.preventDefault()
        event.stopPropagation()
      }
    }

    const handlePopState = () => {
      if (!shouldConfirmLeaveSettings(hasUnsavedChanges, window.location.href, window.location.origin)) return
      const shouldLeave = window.confirm(message)
      if (!shouldLeave) {
        window.history.go(1)
      }
    }

    window.addEventListener("beforeunload", handleBeforeUnload)
    document.addEventListener("click", handleAnchorClick, true)
    window.addEventListener("popstate", handlePopState)

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload)
      document.removeEventListener("click", handleAnchorClick, true)
      window.removeEventListener("popstate", handlePopState)
    }
  }, [hasUnsavedChanges, message])
}
