"use client"

import { useState } from "react"
import Link from "next/link"

export function SubscriptionCancellationClient({
  title,
  description,
  confirmLabel,
  confirmDisabled,
}: {
  title: string
  description: string
  confirmLabel: string | null
  confirmDisabled: boolean
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConfirm() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/billing/cancel", { method: "POST" })
      const data = await res.json()
      if (data.url) {
        window.location.assign(data.url)
        return
      }
      setError(data.error ?? "Something went wrong. Please try again.")
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-lg space-y-6">
      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
            Cancel subscription
          </p>
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        </div>
        <p className="text-sm text-gray-600 leading-6">{description}</p>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/dashboard/settings/subscription"
            className="inline-flex items-center justify-center rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Keep subscription
          </Link>
          {confirmLabel ? (
            <button
              onClick={handleConfirm}
              disabled={loading || confirmDisabled}
              className="inline-flex items-center justify-center rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
            >
              {loading ? "Working…" : confirmLabel}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}