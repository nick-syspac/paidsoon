"use client"

import { useState } from "react"

import {
  SPENDLEAK_SOURCE_TYPES,
  type SpendLeakSourceSettings,
  type SpendLeakSourceType,
} from "@/lib/spendleak/sourceSettingsContract"

interface SourceOption {
  id: SpendLeakSourceType
  label: string
  description: string
}

const SOURCE_OPTIONS: SourceOption[] = [
  {
    id: "bills",
    label: "Bills",
    description: "Accounts payable bills and invoice-like supplier charges synced into SpendLeak.",
  },
  {
    id: "bank_transactions",
    label: "Bank transactions",
    description: "Outgoing bank transaction history used for duplicate-payment and cash-pressure evidence.",
  },
  {
    id: "suppliers",
    label: "Suppliers",
    description: "Supplier profile metadata used for concentration and supplier-context coverage.",
  },
]

function normalizeSelection(value: string[]): SpendLeakSourceType[] {
  const allowed = new Set(SPENDLEAK_SOURCE_TYPES)
  const unique = Array.from(new Set(value)).filter(
    (entry): entry is SpendLeakSourceType => allowed.has(entry as SpendLeakSourceType),
  )
  return unique.length > 0 ? unique : [...SPENDLEAK_SOURCE_TYPES]
}

export function SpendLeakSettingsClient({
  initialSettings,
}: {
  initialSettings: SpendLeakSourceSettings
}) {
  const [enabledSourceTypes, setEnabledSourceTypes] = useState<SpendLeakSourceType[]>(
    normalizeSelection(initialSettings.enabledSourceTypes),
  )
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggleSource(source: SpendLeakSourceType): void {
    setSaved(false)
    setError(null)
    setEnabledSourceTypes((current) => {
      if (current.includes(source)) {
        if (current.length === 1) {
          setError("Select at least one spend source.")
          return current
        }
        return current.filter((entry) => entry !== source)
      }
      return [...current, source]
    })
  }

  async function handleSave(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setSaving(true)
    setSaved(false)
    setError(null)

    const response = await fetch("/api/settings/spendleak", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabledSourceTypes }),
    })

    setSaving(false)

    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: "Failed to save SpendLeak settings" }))
      setError(typeof body.error === "string" ? body.error : "Failed to save SpendLeak settings")
      return
    }

    const body = (await response.json()) as { settings?: SpendLeakSourceSettings }
    setEnabledSourceTypes(normalizeSelection(body.settings?.enabledSourceTypes ?? enabledSourceTypes))
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="text-base font-semibold text-gray-900">Expected source coverage</h3>
        <p className="mt-2 text-sm text-gray-600">
          Choose which spend sources should count toward SpendLeak readiness. This setting controls
          readiness and partial-data messaging only. It does not disable provider or import sync.
        </p>

        <fieldset className="mt-4 space-y-3" aria-describedby="spendleak-source-help">
          <legend className="sr-only">SpendLeak source selection</legend>
          {SOURCE_OPTIONS.map((source) => {
            const checked = enabledSourceTypes.includes(source.id)
            const inputId = `spendleak-source-${source.id}`
            return (
              <label
                key={source.id}
                htmlFor={inputId}
                className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 p-3 hover:border-gray-300"
              >
                <input
                  id={inputId}
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleSource(source.id)}
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span>
                  <span className="block text-sm font-medium text-gray-900">{source.label}</span>
                  <span className="mt-1 block text-sm text-gray-600">{source.description}</span>
                </span>
              </label>
            )
          })}
        </fieldset>

        <p id="spendleak-source-help" className="mt-3 text-xs text-gray-500">
          At least one source must stay selected.
        </p>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {saved ? <p className="text-sm text-green-600">SpendLeak settings saved.</p> : null}

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
