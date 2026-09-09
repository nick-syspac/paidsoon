"use client"

import { useState } from "react"

import type { OwnersDigestSettingsSnapshot } from "@/lib/ownersDigest/types"

export function OwnersDigestSettingsClient({
  settings,
}: {
  settings: OwnersDigestSettingsSnapshot
}) {
  const [form, setForm] = useState<OwnersDigestSettingsSnapshot>(settings)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function saveSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError(null)

    const response = await fetch("/api/owners-digest/settings", {
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
      setForm(payload.settings as OwnersDigestSettingsSnapshot)
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <form onSubmit={saveSettings} className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2">
        <label className="rounded-xl border border-gray-200 bg-white p-4">
          <span className="text-xs uppercase tracking-wide text-gray-500">Digest status</span>
          <select
            value={form.enabled ? "enabled" : "disabled"}
            onChange={(event) => setForm((prev) => ({ ...prev, enabled: event.target.value === "enabled" }))}
            className="mt-3 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="enabled">Enabled</option>
            <option value="disabled">Disabled</option>
          </select>
        </label>

        <label className="rounded-xl border border-gray-200 bg-white p-4">
          <span className="text-xs uppercase tracking-wide text-gray-500">Email delivery</span>
          <select
            value={form.emailEnabled ? "enabled" : "disabled"}
            onChange={(event) => setForm((prev) => ({ ...prev, emailEnabled: event.target.value === "enabled" }))}
            className="mt-3 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="enabled">Enabled</option>
            <option value="disabled">Disabled</option>
          </select>
        </label>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <label className="rounded-xl border border-gray-200 bg-white p-4">
          <span className="text-xs uppercase tracking-wide text-gray-500">Frequency</span>
          <select
            value={form.frequency}
            onChange={(event) => setForm((prev) => ({ ...prev, frequency: event.target.value as OwnersDigestSettingsSnapshot["frequency"] }))}
            className="mt-3 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="off">Off</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </label>

        <label className="rounded-xl border border-gray-200 bg-white p-4">
          <span className="text-xs uppercase tracking-wide text-gray-500">Delivery day</span>
          <select
            value={form.deliveryDay}
            onChange={(event) => setForm((prev) => ({ ...prev, deliveryDay: event.target.value }))}
            className="mt-3 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="monday">Monday</option>
            <option value="tuesday">Tuesday</option>
            <option value="wednesday">Wednesday</option>
            <option value="thursday">Thursday</option>
            <option value="friday">Friday</option>
          </select>
        </label>

        <label className="rounded-xl border border-gray-200 bg-white p-4">
          <span className="text-xs uppercase tracking-wide text-gray-500">Delivery time</span>
          <input
            type="time"
            value={form.deliveryTime}
            onChange={(event) => setForm((prev) => ({ ...prev, deliveryTime: event.target.value }))}
            className="mt-3 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <label className="rounded-xl border border-gray-200 bg-white p-4">
          <span className="text-xs uppercase tracking-wide text-gray-500">Maximum action items</span>
          <input
            type="number"
            min={1}
            max={10}
            value={form.maxActionItems}
            onChange={(event) => setForm((prev) => ({ ...prev, maxActionItems: Number(event.target.value) }))}
            className="mt-3 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>

        <label className="rounded-xl border border-gray-200 bg-white p-4">
          <span className="text-xs uppercase tracking-wide text-gray-500">Minimum materiality (A$)</span>
          <input
            type="number"
            min={0}
            step={10}
            value={Math.round(form.minimumMaterialityCents / 100)}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                minimumMaterialityCents: Math.max(0, Math.round(Number(event.target.value) * 100)),
              }))
            }
            className="mt-3 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="text-base font-semibold text-gray-900">Included sections</h3>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {[
            ["includeNeedsAttention", "Needs attention"],
            ["includeOpportunities", "Opportunities"],
            ["includePositiveChanges", "Positive changes"],
            ["includeKeyNumbers", "Key numbers"],
            ["sendWhenEmpty", "Send digest when no issues are found"],
          ].map(([key, label]) => (
            <label key={key} className="flex items-center gap-3 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={Boolean(form[key as keyof OwnersDigestSettingsSnapshot])}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    [key]: event.target.checked,
                  }))
                }
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <label className="space-y-2">
          <span className="text-sm font-medium text-gray-700">Recipient scope</span>
          <select
            value={form.recipientScope}
            onChange={(event) => setForm((prev) => ({ ...prev, recipientScope: event.target.value as OwnersDigestSettingsSnapshot["recipientScope"] }))}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="owner_only">Business owner only</option>
            <option value="all_authorized_users">All authorized users</option>
          </select>
        </label>
      </section>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save settings"}
        </button>
        {saved ? <span className="text-sm text-green-700">Saved</span> : null}
      </div>
    </form>
  )
}
