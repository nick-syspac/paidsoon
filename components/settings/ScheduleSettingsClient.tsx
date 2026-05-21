"use client"

import { useState } from "react"

interface ScheduleConfig {
  email1DaysAfterDue: number
  email2DaysAfterDue: number
  email3DaysAfterDue: number
}

export function ScheduleSettingsClient({
  isPro,
  schedule,
}: {
  isPro: boolean
  schedule: ScheduleConfig
}) {
  const [values, setValues] = useState(schedule)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const res = await fetch("/api/settings/schedule", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    })
    setSaving(false)
    if (res.ok) {
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } else {
      const data = await res.json()
      setError(data.error?.formErrors?.[0] ?? "Failed to save")
    }
  }

  return (
    <div className="max-w-lg space-y-4">
      <h2 className="text-base font-medium text-gray-900">Follow-up Schedule</h2>
      <p className="text-sm text-gray-500">
        Configure when follow-up emails are sent after an invoice becomes overdue.
        {!isPro && " Custom schedules are available on the Pro plan."}
      </p>

      {!isPro && (
        <div className="bg-gray-50 border border-gray-200 rounded-md px-4 py-3 text-sm text-gray-600">
          You&apos;re on the Free plan. Upgrade to Pro to customize your schedule.
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-4">
        {(["email1DaysAfterDue", "email2DaysAfterDue", "email3DaysAfterDue"] as const).map(
          (field, i) => (
            <div key={field}>
              <label htmlFor={field} className="block text-sm font-medium text-gray-700 mb-1">
                Email {i + 1} — days after due date
              </label>
              <input
                id={field}
                type="number"
                min={1}
                value={values[field]}
                onChange={(e) =>
                  setValues((v) => ({ ...v, [field]: parseInt(e.target.value) || 1 }))
                }
                disabled={!isPro}
                className="w-32 border border-gray-300 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
              />
            </div>
          )
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
        {saved && <p className="text-sm text-green-600">Saved!</p>}

        {isPro && (
          <button
            type="submit"
            disabled={saving}
            className="bg-blue-600 text-white text-sm px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save schedule"}
          </button>
        )}
      </form>
    </div>
  )
}
