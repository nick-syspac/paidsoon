"use client"

import { useState } from "react"

interface CostGuardSettingsData {
  materialityPercent: number | null
  materialityCents: number | null
  defaultLookbackDays: number | null
  alertDigestMode: string | null
}

const DEFAULTS = {
  materialityPercent: 20,
  materialityCents: 10000,
  defaultLookbackDays: 180,
  alertDigestMode: "daily",
} as const

export function CostGuardSettingsClient({ settings }: { settings: CostGuardSettingsData | null }) {
  const [materialityPercent, setMaterialityPercent] = useState<number>(settings?.materialityPercent ?? DEFAULTS.materialityPercent)
  const [materialityCents, setMaterialityCents] = useState<number>(settings?.materialityCents ?? DEFAULTS.materialityCents)
  const [defaultLookbackDays, setDefaultLookbackDays] = useState<number>(settings?.defaultLookbackDays ?? DEFAULTS.defaultLookbackDays)
  const [alertDigestMode, setAlertDigestMode] = useState<string>(settings?.alertDigestMode ?? DEFAULTS.alertDigestMode)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const res = await fetch("/api/settings/cost-guard", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        materialityPercent,
        materialityCents,
        defaultLookbackDays,
        alertDigestMode,
      }),
    })

    setSaving(false)
    if (res.ok) {
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
      return
    }

    const data = await res.json().catch(() => ({ error: "Failed to save Cost Guard settings" }))
    setError(data.error ?? "Failed to save Cost Guard settings")
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="rounded-xl border border-gray-200 bg-white p-4 block">
          <span className="text-xs uppercase tracking-wide text-gray-500">Alert sensitivity</span>
          <div className="mt-3 flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={materialityPercent}
              onChange={(e) => setMaterialityPercent(Number(e.target.value))}
              className="w-28 border border-gray-300 rounded-md px-3 py-2 text-2xl font-semibold text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-2xl font-semibold text-gray-900">%</span>
          </div>
          <p className="mt-2 text-sm text-gray-600">Normal threshold before a cost change is treated as material.</p>
        </label>

        <label className="rounded-xl border border-gray-200 bg-white p-4 block">
          <span className="text-xs uppercase tracking-wide text-gray-500">Minimum materiality</span>
          <div className="mt-3 flex items-center gap-2">
            <span className="text-2xl font-semibold text-gray-900">A$</span>
            <input
              type="number"
              min={0}
              step={100}
              value={materialityCents / 100}
              onChange={(e) => setMaterialityCents(Math.round(Number(e.target.value) * 100))}
              className="w-32 border border-gray-300 rounded-md px-3 py-2 text-2xl font-semibold text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <p className="mt-2 text-sm text-gray-600">Small changes below this level are masked to reduce noise.</p>
        </label>

        <label className="rounded-xl border border-gray-200 bg-white p-4 block">
          <span className="text-xs uppercase tracking-wide text-gray-500">Baseline lookback</span>
          <div className="mt-3 flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={3650}
              step={1}
              value={defaultLookbackDays}
              onChange={(e) => setDefaultLookbackDays(Number(e.target.value))}
              className="w-28 border border-gray-300 rounded-md px-3 py-2 text-2xl font-semibold text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-2xl font-semibold text-gray-900">days</span>
          </div>
          <p className="mt-2 text-sm text-gray-600">Period used to measure a supplier or category against its normal spend.</p>
        </label>

        <label className="rounded-xl border border-gray-200 bg-white p-4 block">
          <span className="text-xs uppercase tracking-wide text-gray-500">Digest frequency</span>
          <select
            value={alertDigestMode}
            onChange={(e) => setAlertDigestMode(e.target.value)}
            className="mt-3 w-full border border-gray-300 rounded-md px-3 py-2 text-2xl font-semibold text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
          <p className="mt-2 text-sm text-gray-600">How often the summary email or digest should be sent.</p>
        </label>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="text-base font-semibold text-gray-900">Current behaviour</h3>
        <ul className="mt-3 space-y-2 text-sm text-gray-700">
          <li>• New supplier detection remains enabled by default.</li>
          <li>• Alert thresholds use a blended percentage and absolute-value trigger.</li>
          <li>• Critical or warning alerts are surfaced in the main dashboard and notification centre.</li>
        </ul>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && <p className="text-sm text-green-600">Cost Guard settings saved.</p>}

      <button
        type="submit"
        disabled={saving}
        className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save settings"}
      </button>
    </form>
  )
}
