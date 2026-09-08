"use client"

import { useState } from "react"

interface CommitGuardSettingsData {
  enabled: boolean
  defaultHorizonDays: number
  safetyBufferMode: "fixed_amount" | "percentage_monthly_commitments" | "weeks_operating_expenses"
  safetyBufferFixedCents: number
  safetyBufferPercent: number | null
  safetyBufferWeeks: number | null
  detectRecurringCommitments: boolean
  detectionMinOccurrences: number
  detectionAmountVariancePercent: number
  detectionIntervalToleranceDays: number
  detectionConfidenceThreshold: "confirmed" | "high" | "medium" | "low"
  alertCommitmentDueSoon: boolean
  alertRenewalApproaching: boolean
  alertNoticePeriodApproaching: boolean
  alertCommitmentAmountChanged: boolean
  alertCommitmentBufferLow: boolean
  alertCommitmentShortfall: boolean
  renewalWarningDays: number[]
}

export function CommitGuardSettingsClient({
  settings,
}: {
  settings: CommitGuardSettingsData
}) {
  const [form, setForm] = useState<CommitGuardSettingsData>(settings)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function saveSettings(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(null)

    const response = await fetch("/api/commitguard/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    })

    setSaving(false)
    if (!response.ok) {
      const payload = await response.json().catch(() => ({ error: "Failed to save settings" }))
      setError(typeof payload.error === "string" ? payload.error : "Failed to save settings")
      return
    }

    const payload = await response.json().catch(() => null)
    if (payload?.settings) {
      setForm(payload.settings as CommitGuardSettingsData)
    }

    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const warningDaysText = form.renewalWarningDays.join(",")

  return (
    <form onSubmit={saveSettings} className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2">
        <label className="rounded-xl border border-gray-200 bg-white p-4">
          <span className="text-xs uppercase tracking-wide text-gray-500">Module status</span>
          <select
            value={form.enabled ? "enabled" : "disabled"}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                enabled: event.target.value === "enabled",
              }))
            }
            className="mt-3 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="enabled">Enabled</option>
            <option value="disabled">Disabled</option>
          </select>
          <p className="mt-2 text-sm text-gray-600">Disable to pause CommitGuard calculations without deleting commitments.</p>
        </label>

        <label className="rounded-xl border border-gray-200 bg-white p-4">
          <span className="text-xs uppercase tracking-wide text-gray-500">Default horizon</span>
          <select
            value={form.defaultHorizonDays}
            onChange={(event) => setForm((prev) => ({ ...prev, defaultHorizonDays: Number(event.target.value) }))}
            className="mt-3 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
            <option value={60}>60 days</option>
            <option value={90}>90 days</option>
          </select>
        </label>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="text-base font-semibold text-gray-900">Safety buffer</h3>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <label className="space-y-2">
            <span className="text-sm font-medium text-gray-700">Mode</span>
            <select
              value={form.safetyBufferMode}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  safetyBufferMode: event.target.value as CommitGuardSettingsData["safetyBufferMode"],
                }))
              }
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="fixed_amount">Fixed amount</option>
              <option value="percentage_monthly_commitments">% of monthly commitments</option>
              <option value="weeks_operating_expenses">Weeks of operating expenses</option>
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-gray-700">Fixed amount (A$)</span>
            <input
              type="number"
              min={0}
              step={10}
              value={Math.round(form.safetyBufferFixedCents / 100)}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  safetyBufferFixedCents: Math.max(0, Math.round(Number(event.target.value) * 100)),
                }))
              }
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-gray-700">Buffer percent</span>
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={form.safetyBufferPercent ?? 0}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  safetyBufferPercent: Number(event.target.value),
                }))
              }
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
        </div>
      </section>

      <details className="rounded-xl border border-gray-200 bg-white p-4">
        <summary className="cursor-pointer text-base font-semibold text-gray-900">Advanced detection rules</summary>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-medium text-gray-700">Enable recurring detection</span>
            <select
              value={form.detectRecurringCommitments ? "enabled" : "disabled"}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, detectRecurringCommitments: event.target.value === "enabled" }))
              }
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="enabled">Enabled</option>
              <option value="disabled">Disabled</option>
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-gray-700">Minimum occurrences</span>
            <input
              type="number"
              min={2}
              max={10}
              value={form.detectionMinOccurrences}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, detectionMinOccurrences: Number(event.target.value) }))
              }
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-gray-700">Amount variance tolerance (%)</span>
            <input
              type="number"
              min={1}
              max={100}
              value={form.detectionAmountVariancePercent}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, detectionAmountVariancePercent: Number(event.target.value) }))
              }
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-gray-700">Interval tolerance (days)</span>
            <input
              type="number"
              min={1}
              max={30}
              value={form.detectionIntervalToleranceDays}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, detectionIntervalToleranceDays: Number(event.target.value) }))
              }
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-gray-700">Confidence threshold</span>
            <select
              value={form.detectionConfidenceThreshold}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  detectionConfidenceThreshold: event.target.value as CommitGuardSettingsData["detectionConfidenceThreshold"],
                }))
              }
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-gray-700">Renewal warning days (comma separated)</span>
            <input
              type="text"
              value={warningDaysText}
              onChange={(event) => {
                const values = event.target.value
                  .split(",")
                  .map((value) => Number(value.trim()))
                  .filter((value) => Number.isFinite(value) && value > 0)
                  .map((value) => Math.floor(value))

                setForm((prev) => ({
                  ...prev,
                  renewalWarningDays: values.length > 0 ? values : prev.renewalWarningDays,
                }))
              }}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
        </div>
      </details>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="text-base font-semibold text-gray-900">Alerts</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {[
            ["Commitment due soon", "alertCommitmentDueSoon"],
            ["Renewal approaching", "alertRenewalApproaching"],
            ["Notice period approaching", "alertNoticePeriodApproaching"],
            ["Commitment amount changed", "alertCommitmentAmountChanged"],
            ["Safety buffer low", "alertCommitmentBufferLow"],
            ["Shortfall detected", "alertCommitmentShortfall"],
          ].map(([label, key]) => (
            <label key={key} className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2">
              <span className="text-sm text-gray-800">{label}</span>
              <input
                type="checkbox"
                checked={Boolean(form[key as keyof CommitGuardSettingsData])}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    [key]: event.target.checked,
                  }))
                }
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
            </label>
          ))}
        </div>
      </section>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {saved ? <p className="text-sm text-green-600">CommitGuard settings saved.</p> : null}

      <button
        type="submit"
        disabled={saving}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save settings"}
      </button>
    </form>
  )
}
