"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"

const TIER_LABELS: Record<string, string> = {
  starter: "Starter",
  solo: "Solo",
  small_business: "Small Business",
  free: "Starter",
  pro: "Solo",
}

function getInitials(displayName: string | null, email: string): string {
  if (displayName && displayName.trim().length > 0) {
    const parts = displayName.trim().split(/\s+/)
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase()
    }
    return displayName.trim().slice(0, 2).toUpperCase()
  }
  return email.slice(0, 2).toUpperCase()
}

export function UserMenu({
  email,
  displayName,
  tier,
  status,
}: {
  email: string
  displayName: string | null
  tier: string
  status: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside)
    }
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [open])

  const initials = getInitials(displayName, email)
  const primaryLine = displayName && displayName.trim().length > 0 ? displayName.trim() : email
  const secondaryLine = displayName && displayName.trim().length > 0 ? email : null
  const tierLabel = TIER_LABELS[tier] ?? tier

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 focus:outline-none"
        aria-haspopup="true"
        aria-expanded={open}
      >
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-gray-900 text-white text-xs font-semibold select-none">
          {initials}
        </span>
        <svg
          className={`w-3.5 h-3.5 text-gray-500 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 rounded-lg border border-gray-200 bg-white shadow-lg z-50 py-1">
          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-medium text-gray-900 truncate">{primaryLine}</p>
            {secondaryLine && (
              <p className="text-xs text-gray-500 truncate mt-0.5">{secondaryLine}</p>
            )}
            <span className="inline-block mt-2 px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs font-medium">
              {tierLabel}
            </span>
          </div>

          {/* Links */}
          <div className="py-1">
            <Link
              href="/dashboard/settings/account"
              onClick={() => setOpen(false)}
              className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Account
            </Link>
            <Link
              href="/dashboard/settings"
              onClick={() => setOpen(false)}
              className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Settings
            </Link>
          </div>

          {/* Sign out */}
          <div className="border-t border-gray-100 py-1">
            <form action="/auth/sign-out" method="POST">
              <button
                type="submit"
                className="w-full text-left px-4 py-2 text-sm text-gray-500 hover:bg-gray-50 hover:text-gray-700"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
