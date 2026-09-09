"use client"

import { useState } from "react"

export interface RunwayGuardSettingsData {
  enabled: boolean
  horizonDays: number
  warningThresholdDays: number
  criticalThresholdDays: number
  lowConfidenceWeight: number
  minimumConfidence: number
}

export function RunwayGuardSettingsClient({ settings }: { settings: RunwayGuardSettingsData }) {
  const [form, setForm] = useState<RunwayGuardSettingsData>(settings)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const thresholdError =
    form.criticalThresholdDays >= form.warningThresholdDays
      ? "Critical threshold must be lower than the warning threshold."
      : null

  async function saveSettings(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    if (thresholdError) {
      setError(thresholdError)
      return
    }

    setSaving(true)

    try {
      const response = await fetch("/api/runway-guard/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({ error: "Failed to save settings" }))) as {
          error?: string
        }
        setError(payload.error ?? "Failed to save settings")
        return
      }

      const payload = (await response.json().catch(() => null)) as { settings?: RunwayGuardSettingsData } | null
      if (payload?.settings) {
        setForm(payload.settings)
      }

      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch {
      setError("Failed to save settings")
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={saveSettings} className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2">
        <label className="rounded-xl border border-gray-200 bg-white p-4">
          <span className="text-xs uppercase tracking-wide text-gray-500">Module status</span>
          <select
            value={form.enabled ? "enabled" : "disabled"}
            onChange={(event) => setForm((prev) => ({ ...prev, enabled: event.target.value === "enabled" }))}
            className="mt-3 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="enabled">Enabled</option>
            <option value="disabled">Disabled</option>
          </select>
          <p className="mt-2 text-sm text-gray-600">Enable or disable the forecast without deleting runway history.</p>
        </label>

        <label className="rounded-xl border border-gray-200 bg-white p-4">
          <span className="text-xs uppercase tracking-wide text-gray-500">Forecast horizon</span>
          <select
            value={form.horizonDays}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                horizonDays: Number(event.target.value),
              }))
            }
            className="mt-3 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value={30}>30 days</option>
            <option value={60}>60 days</option>
            <option value={90}>90 days</option>
            <option value={180}>180 days</option>
            <option value={365}>365 days</option>
          </select>
        </label>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="text-base font-semibold text-gray-900">Risk thresholds</h3>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <label className="space-y-2">
            <span className="text-sm font-medium text-gray-700">Warning threshold</span>
            <input
              type="number"
              min={1}
              max={3650}
              value={form.warningThresholdDays}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  warningThresholdDays: Number(event.target.value),
                }))
              }
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-gray-700">Critical threshold</span>
            <input
              type="number"
              min={1}
              max={3650}
              value={form.criticalThresholdDays}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  criticalThresholdDays: Number(event.target.value),
                }))
              }
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-gray-700">Minimum confidence</span>
            <input
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={form.minimumConfidence}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  minimumConfidence: Number(event.target.value),
                }))
              }
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="text-base font-semibold text-gray-900">Confidence weighting</h3>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-medium text-gray-700">Low-confidence weight</span>
            <input
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={form.lowConfidenceWeight}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  lowConfidenceWeight: Number(event.target.value),
                }))
              }
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>

          <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-wide text-gray-500">Model guidance</p>
            <p className="mt-2 text-sm text-gray-600">
              Lower confidence weightings reduce the impact of weaker inflow signals when runway risk is assessed.
            </p>
          </div>
        </div>
      </section>

      {(thresholdError || error) && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{thresholdError ?? error}</div>
      )}

      {saved && <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">Saved RunwayGuard settings.</div>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save settings"}
        </button>
      </div>
    </form>
  )
}
