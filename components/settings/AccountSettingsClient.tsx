"use client"

import { useState } from "react"
import type { SubscriptionTier } from "@/lib/subscriptionPlans"
import { isDraftDirty, resolvePersistedDraft } from "@/lib/settings/editDraft"
import { useUnsavedChangesGuard } from "@/components/settings/useUnsavedChangesGuard"

const TIER_LABELS: Record<string, string> = {
  starter: "Essentials",
  essentials: "Essentials",
  solo: "Business Control",
  business_control: "Business Control",
  small_business: "Small Business",
  business_pro: "Business Pro",
  accountant_partner: "Accountant Partner",
  free: "Essentials",
  pro: "Business Control",
}

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  trialing: "Trial",
  canceled: "Canceled",
  cancelled: "Cancelled",
  past_due: "Past Due",
  unpaid: "Unpaid",
  incomplete: "Incomplete",
}

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

function dateOnlyInput(value: Date | string | null): string {
  if (!value) return ""
  if (typeof value === "string") return value.slice(0, 10)
  return value.toISOString().slice(0, 10)
}

export function AccountSettingsClient({
  email,
  displayName: initialDisplayName,
  accountDisplayFromDate: initialAccountDisplayFromDate,
  accountDisplayRevision: initialAccountDisplayRevision,
  tier,
  status,
  createdAt,
}: {
  email: string
  displayName: string | null
  accountDisplayFromDate: Date | string | null
  accountDisplayRevision: number
  tier: SubscriptionTier
  status: string
  createdAt: Date
}) {
  const [displayName, setDisplayName] = useState(initialDisplayName ?? "")
  const [persistedDisplayName, setPersistedDisplayName] = useState(initialDisplayName ?? "")
  const [displayFromDate, setDisplayFromDate] = useState(dateOnlyInput(initialAccountDisplayFromDate))
  const [persistedDisplayFromDate, setPersistedDisplayFromDate] = useState(dateOnlyInput(initialAccountDisplayFromDate))
  const [accountDisplayRevision, setAccountDisplayRevision] = useState(initialAccountDisplayRevision)
  const [saving, setSaving] = useState(false)
  const [savingAccountDate, setSavingAccountDate] = useState(false)
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null)
  const [accountDateFeedback, setAccountDateFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null)

  const hasUnsavedChanges = isDraftDirty(
    { displayName, displayFromDate },
    { displayName: persistedDisplayName, displayFromDate: persistedDisplayFromDate },
  )

  useUnsavedChangesGuard({ hasUnsavedChanges })

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
        setPersistedDisplayName((current) =>
          resolvePersistedDraft({ displayName }, { displayName: current }, true).displayName,
        )
        setFeedback({ type: "success", message: "Display name saved" })
      }
    } catch {
      setFeedback({ type: "error", message: "An unexpected error occurred" })
    } finally {
      setSaving(false)
    }
  }

  async function handleAccountDateSave(nextValue: string | null) {
    setAccountDateFeedback(null)
    setSavingAccountDate(true)
    try {
      const res = await fetch("/api/settings/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayFromDate: nextValue,
          expectedRevision: accountDisplayRevision,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setAccountDateFeedback({
          type: "error",
          message: res.status === 409 ? "This account date changed elsewhere. Review the current value and try again." : data.error ?? "Failed to save account date",
        })
        return
      }

      setPersistedDisplayFromDate(data.displayFromDate ?? "")
      setDisplayFromDate(data.displayFromDate ?? "")
      setAccountDisplayRevision(data.revision)
      setAccountDateFeedback({
        type: "success",
        message: data.displayFromDate ? "Display from date saved" : "Display from date cleared",
      })
    } catch {
      setAccountDateFeedback({ type: "error", message: "An unexpected error occurred" })
    } finally {
      setSavingAccountDate(false)
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

      <div className="space-y-4 border border-gray-200 rounded-md p-4 bg-gray-50">
        <div>
          <h2 className="text-base font-semibold text-gray-900 mb-1">Display from</h2>
          <p className="text-sm text-gray-500">
            Hide older invoices and reminders before this date. A blank value keeps the current account history visible.
          </p>
        </div>

        <div>
          <label htmlFor="accountDisplayFromDate" className="block text-sm font-medium text-gray-700 mb-1">
            Account display date
          </label>
          <div className="flex gap-3 items-center">
            <input
              id="accountDisplayFromDate"
              type="date"
              value={displayFromDate}
              onChange={(event) => {
                setDisplayFromDate(event.target.value)
                setAccountDateFeedback(null)
              }}
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
            <button
              type="button"
              onClick={() => handleAccountDateSave(displayFromDate || null)}
              disabled={savingAccountDate || displayFromDate === persistedDisplayFromDate}
              className="px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-md hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {savingAccountDate ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setDisplayFromDate(persistedDisplayFromDate)}
              className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-100"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={() => {
                setDisplayFromDate("")
                setAccountDateFeedback(null)
              }}
              className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-100"
            >
              Clear
            </button>
          </div>
          {accountDateFeedback && (
            <p className={`mt-2 text-sm ${accountDateFeedback.type === "success" ? "text-green-600" : "text-red-600"}`}>
              {accountDateFeedback.message}
            </p>
          )}
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
