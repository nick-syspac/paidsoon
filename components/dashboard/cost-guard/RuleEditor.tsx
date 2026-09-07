"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

const ruleTypes = [
  { value: "supplier_increase", label: "Supplier increase" },
  { value: "category_increase", label: "Category increase" },
  { value: "large_unusual_invoice", label: "Large unusual invoice" },
  { value: "duplicate_spend", label: "Duplicate spend" },
  { value: "new_supplier", label: "New supplier" },
  { value: "recurring_increase", label: "Recurring increase" },
  { value: "forecast_overrun", label: "Forecast overrun" },
] as const

const severities = [
  { value: "info", label: "Info" },
  { value: "watch", label: "Watch" },
  { value: "warning", label: "Warning" },
  { value: "critical", label: "Critical" },
] as const

const defaultForm = {
  name: "",
  ruleType: "supplier_increase",
  percentageThreshold: 20,
  absoluteThresholdCents: 10000,
  severity: "warning" as const,
  enabled: true,
}

export function RuleEditor() {
  const router = useRouter()
  const [form, setForm] = useState(defaultForm)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setMessage(null)

    const response = await fetch("/api/cost-guard/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        ruleType: form.ruleType,
        percentageThreshold: Number(form.percentageThreshold),
        absoluteThresholdCents: Number(form.absoluteThresholdCents),
        severity: form.severity,
        enabled: form.enabled,
      }),
    })

    const data = (await response.json().catch(() => null)) as { error?: unknown; rule?: unknown } | null

    setSaving(false)

    if (!response.ok) {
      setMessage(data?.error ? "The rule could not be saved. Please adjust the values and try again." : "The rule could not be saved.")
      return
    }

    setMessage("Rule created successfully.")
    setForm(defaultForm)
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Create a rule</h3>
          <p className="mt-1 text-sm text-gray-600">Set the thresholds for a custom Cost Guard signal.</p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label htmlFor="cost-guard-rule-name" className="block text-sm text-gray-700">
          <span className="mb-1 block font-medium">Rule name</span>
          <input
            id="cost-guard-rule-name"
            required
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            className="w-full rounded-md border border-gray-300 px-3 py-2 outline-none ring-0 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
            placeholder="e.g. Agency monthly overspend"
          />
        </label>

        <label htmlFor="cost-guard-rule-type" className="block text-sm text-gray-700">
          <span className="mb-1 block font-medium">Rule type</span>
          <select
            id="cost-guard-rule-type"
            value={form.ruleType}
            onChange={(event) => setForm((current) => ({ ...current, ruleType: event.target.value }))}
            className="w-full rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
          >
            {ruleTypes.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label htmlFor="cost-guard-percentage-threshold" className="block text-sm text-gray-700">
          <span className="mb-1 block font-medium">Percentage threshold</span>
          <input
            id="cost-guard-percentage-threshold"
            type="number"
            min={0}
            max={100}
            step={1}
            value={form.percentageThreshold}
            onChange={(event) => setForm((current) => ({ ...current, percentageThreshold: Number(event.target.value) }))}
            className="w-full rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
          />
        </label>

        <label htmlFor="cost-guard-absolute-threshold" className="block text-sm text-gray-700">
          <span className="mb-1 block font-medium">Absolute threshold (AUD)</span>
          <input
            id="cost-guard-absolute-threshold"
            type="number"
            min={0}
            step={100}
            value={form.absoluteThresholdCents / 100}
            onChange={(event) => setForm((current) => ({ ...current, absoluteThresholdCents: Number(event.target.value) * 100 }))}
            className="w-full rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
          />
        </label>

        <label htmlFor="cost-guard-severity" className="block text-sm text-gray-700">
          <span className="mb-1 block font-medium">Severity</span>
          <select
            id="cost-guard-severity"
            value={form.severity}
            onChange={(event) => setForm((current) => ({ ...current, severity: event.target.value as typeof form.severity }))}
            className="w-full rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
          >
            {severities.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label htmlFor="cost-guard-rule-enabled" className="flex items-center gap-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
          <input
            id="cost-guard-rule-enabled"
            type="checkbox"
            checked={form.enabled}
            onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.checked }))}
            className="h-4 w-4 accent-blue-600"
          />
          Enabled
        </label>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="text-sm text-gray-600">{message ?? "Thresholds combine percentage and dollar values before a rule triggers."}</div>
        <button
          type="submit"
          aria-label="Create Cost Guard rule"
          disabled={saving || !form.name.trim()}
          className="inline-flex rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving..." : "Create rule"}
        </button>
      </div>
    </form>
  )
}
