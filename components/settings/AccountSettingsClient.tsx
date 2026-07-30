"use client"

import { useState } from "react"
import type { SubscriptionTier } from "@/lib/subscriptionPlans"

const TIER_LABELS: Record<string, string> = {
  starter: "Starter",
  solo: "Solo",
  small_business: "Small Business",
  accountant_partner: "Accountant Partner",
  free: "Starter",
  pro: "Solo",
}

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  trialing: "Trial",
  cancelled: "Cancelled",
  past_due: "Past Due",
}

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

export function AccountSettingsClient({
  email,
  displayName: initialDisplayName,
  tier,
  status,
  createdAt,
}: {
  email: string
  displayName: string | null
  tier: SubscriptionTier
  status: string
  createdAt: Date
}) {
  const [displayName, setDisplayName] = useState(initialDisplayName ?? "")
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null)

  async function handleSave() {
    setFeedback(null)
    setSaving(true)
    try {
      const res = await fetch("/api/settings/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName }),
      })
      const data = await res.json()
      if (!res.ok) {
        setFeedback({ type: "error", message: data.error ?? "Failed to save" })
      } else {
        setFeedback({ type: "success", message: "Display name saved" })
      }
    } catch {
      setFeedback({ type: "error", message: "An unexpected error occurred" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-8 max-w-lg">
      <div>
        <h2 className="text-base font-semibold text-gray-900 mb-1">Profile</h2>
        <p className="text-sm text-gray-500">
          Your display name appears as <code className="bg-gray-100 px-1 rounded text-xs">{"{{yourName}}"}</code> in automated reminder emails sent to your clients.
        </p>
      </div>

      <div className="space-y-4">
        {/* Display name */}
        <div>
          <label htmlFor="displayName" className="block text-sm font-medium text-gray-700 mb-1">
            Display name
          </label>
          <div className="flex gap-3">
            <input
              id="displayName"
              type="text"
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value)
                setFeedback(null)
              }}
              maxLength={100}
              placeholder="Your name or business name"
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
            <button
              onClick={handleSave}
              disabled={saving || displayName.trim().length === 0}
              className="px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-md hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
          {feedback && (
            <p className={`mt-2 text-sm ${feedback.type === "success" ? "text-green-600" : "text-red-600"}`}>
              {feedback.message}
            </p>
          )}
        </div>

        {/* Email — read only */}
        <div>
          <p className="block text-sm font-medium text-gray-700 mb-1">Email</p>
          <p className="text-sm text-gray-900 bg-gray-50 rounded-md border border-gray-200 px-3 py-2">
            {email}
          </p>
        </div>
      </div>

      {/* Account info */}
      <div>
        <h2 className="text-base font-semibold text-gray-900 mb-3">Account</h2>
        <dl className="space-y-3">
          <div className="flex justify-between text-sm">
            <dt className="text-gray-500">Plan</dt>
            <dd className="text-gray-900 font-medium">{TIER_LABELS[tier] ?? tier}</dd>
          </div>
          <div className="flex justify-between text-sm">
            <dt className="text-gray-500">Status</dt>
            <dd className="text-gray-900">{STATUS_LABELS[status] ?? status}</dd>
          </div>
          <div className="flex justify-between text-sm">
            <dt className="text-gray-500">Member since</dt>
            <dd className="text-gray-900">{formatDate(createdAt)}</dd>
          </div>
        </dl>
      </div>
    </div>
  )
}
