"use client"

import { useMemo, useState } from "react"

interface DepositGuardSettingsData {
  autoReminderEnabled: boolean
  initialReminderOffsetDays: number
  beforeDueOffsetDays: number
  overdue3Enabled: boolean
  overdue7Enabled: boolean
  paymentProviderDefault: "manual_external_link" | "stripe_connect"
  requireDepositBeforeStart: boolean
  settingsJson: Record<string, unknown> | null
}

function serializeSettingsJson(settingsJson: Record<string, unknown> | null): string {
  if (!settingsJson) return ""

  return JSON.stringify(settingsJson, null, 2)
}

function parseSettingsJson(value: string): Record<string, unknown> | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  const parsed = JSON.parse(trimmed)
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Advanced metadata must be a JSON object")
  }

  return parsed as Record<string, unknown>
}

function numberInputValue(value: number): string {
  return Number.isFinite(value) ? String(value) : "0"
}

export function DepositGuardSettingsClient({ settings }: { settings: DepositGuardSettingsData }) {
  const [form, setForm] = useState({
    ...settings,
    settingsJsonText: serializeSettingsJson(settings.settingsJson),
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reminderSummary = useMemo(() => {
    const items = [
      form.autoReminderEnabled ? "automatic reminders on" : "automatic reminders off",
      `initial ${form.initialReminderOffsetDays} day${form.initialReminderOffsetDays === 1 ? "" : "s"}`,
      `before-due ${form.beforeDueOffsetDays} day${form.beforeDueOffsetDays === 1 ? "" : "s"}`,
      form.overdue3Enabled ? "3-day overdue enabled" : "3-day overdue disabled",
      form.overdue7Enabled ? "7-day overdue enabled" : "7-day overdue disabled",
    ]

    return items.join(" · ")
  }, [
    form.autoReminderEnabled,
    form.beforeDueOffsetDays,
    form.initialReminderOffsetDays,
    form.overdue3Enabled,
    form.overdue7Enabled,
  ])

  async function saveSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError(null)

    let settingsJson: Record<string, unknown> | null
    try {
      settingsJson = parseSettingsJson(form.settingsJsonText)
    } catch (parseError) {
      setSaving(false)
      setError(parseError instanceof Error ? parseError.message : "Invalid advanced metadata")
      return
    }

    const response = await fetch("/api/deposit-guard/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        autoReminderEnabled: form.autoReminderEnabled,
        initialReminderOffsetDays: form.initialReminderOffsetDays,
        beforeDueOffsetDays: form.beforeDueOffsetDays,
        overdue3Enabled: form.overdue3Enabled,
        overdue7Enabled: form.overdue7Enabled,
        paymentProviderDefault: form.paymentProviderDefault,
        requireDepositBeforeStart: form.requireDepositBeforeStart,
        settingsJson,
      }),
    })

    setSaving(false)
    if (!response.ok) {
      const payload = await response.json().catch(() => ({ error: "Failed to save settings" }))
      setError(typeof payload.error === "string" ? payload.error : "Failed to save settings")
      return
    }

    const payload = await response.json().catch(() => null)
    if (payload?.settings) {
      setForm({
        autoReminderEnabled: Boolean(payload.settings.autoReminderEnabled),
        initialReminderOffsetDays: Number(payload.settings.initialReminderOffsetDays ?? 0),
        beforeDueOffsetDays: Number(payload.settings.beforeDueOffsetDays ?? 0),
        overdue3Enabled: Boolean(payload.settings.overdue3Enabled),
        overdue7Enabled: Boolean(payload.settings.overdue7Enabled),
        paymentProviderDefault: payload.settings.paymentProviderDefault as DepositGuardSettingsData["paymentProviderDefault"],
        requireDepositBeforeStart: Boolean(payload.settings.requireDepositBeforeStart),
        settingsJson:
          typeof payload.settings.settingsJson === "object" && payload.settings.settingsJson !== null
            ? (payload.settings.settingsJson as Record<string, unknown>)
            : null,
        settingsJsonText: serializeSettingsJson(
          typeof payload.settings.settingsJson === "object" && payload.settings.settingsJson !== null
            ? (payload.settings.settingsJson as Record<string, unknown>)
            : null,
        ),
      })
    }

    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <form onSubmit={saveSettings} className="space-y-6">
      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Rules and reminders</h3>
            <p className="mt-1 text-sm text-gray-600">
              Control when reminders fire and whether work is blocked until the deposit is received.
            </p>
          </div>
          <p className="text-xs text-gray-500">{reminderSummary}</p>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-3">
            <span>
              <span className="block text-sm font-medium text-gray-800">Automatic reminders</span>
              <span className="mt-1 block text-xs text-gray-500">Disable to keep request reminders manual only.</span>
            </span>
            <input
              type="checkbox"
              checked={form.autoReminderEnabled}
              onChange={(event) => setForm((prev) => ({ ...prev, autoReminderEnabled: event.target.checked }))}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
          </label>

          <label className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-3">
            <span>
              <span className="block text-sm font-medium text-gray-800">Block work before deposit</span>
              <span className="mt-1 block text-xs text-gray-500">Require the requested deposit before a job can start.</span>
            </span>
            <input
              type="checkbox"
              checked={form.requireDepositBeforeStart}
              onChange={(event) => setForm((prev) => ({ ...prev, requireDepositBeforeStart: event.target.checked }))}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-gray-700">Initial reminder offset (days)</span>
            <input
              type="number"
              min={0}
              max={30}
              value={numberInputValue(form.initialReminderOffsetDays)}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, initialReminderOffsetDays: Math.max(0, Number(event.target.value)) }))
              }
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-gray-700">Before-due reminder offset (days)</span>
            <input
              type="number"
              min={0}
              max={30}
              value={numberInputValue(form.beforeDueOffsetDays)}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, beforeDueOffsetDays: Math.max(0, Number(event.target.value)) }))
              }
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>

          <label className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-3">
            <span className="text-sm font-medium text-gray-800">Send 3-day overdue reminder</span>
            <input
              type="checkbox"
              checked={form.overdue3Enabled}
              onChange={(event) => setForm((prev) => ({ ...prev, overdue3Enabled: event.target.checked }))}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
          </label>

          <label className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-3">
            <span className="text-sm font-medium text-gray-800">Send 7-day overdue reminder</span>
            <input
              type="checkbox"
              checked={form.overdue7Enabled}
              onChange={(event) => setForm((prev) => ({ ...prev, overdue7Enabled: event.target.checked }))}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
          </label>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="text-base font-semibold text-gray-900">Payments</h3>
        <p className="mt-1 text-sm text-gray-600">
          Choose the default provider used when a deposit request is generated.
        </p>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="space-y-2 md:max-w-sm">
            <span className="text-sm font-medium text-gray-700">Default payment provider</span>
            <select
              value={form.paymentProviderDefault}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  paymentProviderDefault: event.target.value as DepositGuardSettingsData["paymentProviderDefault"],
                }))
              }
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="manual_external_link">Manual external link</option>
              <option value="stripe_connect">Stripe Connect</option>
            </select>
          </label>

          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
            The backend currently persists the default provider and deposit-start rule. Stripe Connect availability is still
            controlled by the existing payment-provider abstraction.
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="text-base font-semibold text-gray-900">Branding and integrations</h3>
        <p id="deposit-guard-advanced-metadata-help" className="mt-1 text-sm text-gray-600">
          Optional JSON metadata for future branding or integration-specific fields. Keep it as an object.
        </p>

        <label className="mt-4 block space-y-2">
          <span className="text-sm font-medium text-gray-700">Advanced metadata JSON</span>
          <textarea
            aria-describedby="deposit-guard-advanced-metadata-help"
            value={form.settingsJsonText}
            onChange={(event) => setForm((prev) => ({ ...prev, settingsJsonText: event.target.value }))}
            rows={7}
            spellCheck={false}
            className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
            placeholder='{"brandColor":"#0f172a","integration":{"provider":"xero"}}'
          />
        </label>
      </section>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div aria-live="polite" role="status">
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {saved ? <p className="text-sm text-green-600">DepositGuard settings saved.</p> : null}
        </div>

        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save settings"}
        </button>
      </div>
    </form>
  )
}