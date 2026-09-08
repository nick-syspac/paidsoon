"use client"

import { useState } from "react"

interface TaxBufferCategoryForm {
  id: string
  categoryType: string
  name: string
  enabled: boolean
  calculationMethod: "integration" | "fixed_amount" | "percentage_profit" | "percentage_revenue" | "manual"
  recurrence: "weekly" | "fortnightly" | "monthly" | "quarterly" | "annually" | "one_off"
  ratePercent: number | null
  fixedAmountCents: number | null
  manualAmountCents: number | null
}

interface TaxBufferSettingsData {
  enabled: boolean
  accountingBasis: "cash" | "accrual"
  businessType: string
  gstRegistered: boolean
  gstFrequency: "monthly" | "quarterly" | "annually"
  reserveBalanceSource: "manual" | "connected_account"
  reserveBalanceCents: number
  reserveAccountName: string | null
  categories: TaxBufferCategoryForm[]
  suggestedDefaults: {
    available: boolean
    reasons: string[]
    values: {
      enabled: boolean
      gstRegistered: boolean
      accountingBasis: "cash" | "accrual"
      gstFrequency: "monthly" | "quarterly" | "annually"
      reserveBalanceSource: "manual" | "connected_account"
      businessType: string
    }
  }
}

function formatCentsAsAud(cents: number | null): string {
  const value = (cents ?? 0) / 100
  return value.toString()
}

export function TaxBufferSettingsClient({
  settings,
  canCustomizeCategories,
}: {
  settings: TaxBufferSettingsData
  canCustomizeCategories: boolean
}) {
  const [form, setForm] = useState<TaxBufferSettingsData>(settings)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function updateCategory(categoryId: string, updater: (category: TaxBufferCategoryForm) => TaxBufferCategoryForm) {
    setForm((prev) => ({
      ...prev,
      categories: prev.categories.map((category) =>
        category.id === categoryId ? updater(category) : category,
      ),
    }))
  }

  function applySuggestedDefaults() {
    if (!form.suggestedDefaults.available) return
    setForm((prev) => ({
      ...prev,
      enabled: prev.suggestedDefaults.values.enabled,
      gstRegistered: prev.suggestedDefaults.values.gstRegistered,
      accountingBasis: prev.suggestedDefaults.values.accountingBasis,
      gstFrequency: prev.suggestedDefaults.values.gstFrequency,
      reserveBalanceSource: prev.suggestedDefaults.values.reserveBalanceSource,
      businessType: prev.suggestedDefaults.values.businessType,
    }))
  }

  async function saveSettings(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(null)

    const response = await fetch("/api/settings/tax-buffer", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    })

    setSaving(false)
    if (!response.ok) {
      const payload = await response.json().catch(() => ({ error: "Failed to save Tax Buffer settings" }))
      setError(typeof payload.error === "string" ? payload.error : "Failed to save Tax Buffer settings")
      return
    }

    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <form onSubmit={saveSettings} className="space-y-4">
      {!form.enabled && form.suggestedDefaults.available ? (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
          <p className="text-sm font-medium text-blue-900">Suggested first-time setup available</p>
          <p className="mt-1 text-xs text-blue-800">
            PaidSoon found enough source data to prefill your Tax Buffer baseline.
          </p>
          {form.suggestedDefaults.reasons.length > 0 ? (
            <ul className="mt-2 space-y-1 text-xs text-blue-800">
              {form.suggestedDefaults.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          ) : null}
          <button
            type="button"
            onClick={applySuggestedDefaults}
            className="mt-3 rounded-md bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700"
          >
            Apply suggested defaults
          </button>
        </div>
      ) : null}

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-900">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(event) => setForm((prev) => ({ ...prev, enabled: event.target.checked }))}
          />
          Enable Tax Buffer
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-700">
          <span className="text-xs uppercase tracking-wide text-gray-500">Accounting basis</span>
          <select
            className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2"
            value={form.accountingBasis}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, accountingBasis: event.target.value as "cash" | "accrual" }))
            }
          >
            <option value="cash">Cash</option>
            <option value="accrual">Accrual</option>
          </select>
        </label>

        <label className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-700">
          <span className="text-xs uppercase tracking-wide text-gray-500">Business type</span>
          <input
            className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2"
            value={form.businessType}
            onChange={(event) => setForm((prev) => ({ ...prev, businessType: event.target.value }))}
          />
        </label>

        <label className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-700">
          <span className="text-xs uppercase tracking-wide text-gray-500">GST frequency</span>
          <select
            className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2"
            value={form.gstFrequency}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                gstFrequency: event.target.value as "monthly" | "quarterly" | "annually",
              }))
            }
          >
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="annually">Annually</option>
          </select>
        </label>

        <label className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-700">
          <span className="text-xs uppercase tracking-wide text-gray-500">Tax reserve balance</span>
          <input
            type="number"
            min={0}
            step={100}
            className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2"
            value={form.reserveBalanceCents / 100}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, reserveBalanceCents: Math.max(0, Math.round(Number(event.target.value) * 100)) }))
            }
          />
          <p className="mt-1 text-xs text-gray-500">Enter the amount currently quarantined for tax.</p>
        </label>
      </div>

      <section className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-gray-900">Reserve categories</h3>
        <p className="text-xs text-gray-600">
          Configure the method and cadence used to estimate each obligation reserve.
        </p>

        <div className="space-y-3">
          {form.categories.map((category) => {
            const isCustomLocked = category.categoryType === "custom" && !canCustomizeCategories

            return (
              <div key={category.id} className="rounded-lg border border-gray-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{category.name}</p>
                    <p className="text-[11px] uppercase tracking-wide text-gray-500">{category.categoryType}</p>
                  </div>
                  <label className="inline-flex items-center gap-2 text-xs font-medium text-gray-700">
                    <input
                      type="checkbox"
                      checked={category.enabled}
                      disabled={isCustomLocked}
                      onChange={(event) =>
                        updateCategory(category.id, (current) => ({
                          ...current,
                          enabled: event.target.checked,
                        }))
                      }
                    />
                    Enabled
                  </label>
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <label className="text-xs text-gray-700">
                    <span className="uppercase tracking-wide text-gray-500">Method</span>
                    <select
                      className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5"
                      value={category.calculationMethod}
                      disabled={isCustomLocked}
                      onChange={(event) =>
                        updateCategory(category.id, (current) => ({
                          ...current,
                          calculationMethod: event.target.value as TaxBufferCategoryForm["calculationMethod"],
                        }))
                      }
                    >
                      <option value="integration">Integration</option>
                      <option value="fixed_amount">Fixed amount</option>
                      <option value="percentage_profit">% of profit</option>
                      <option value="percentage_revenue">% of revenue</option>
                      <option value="manual">Manual</option>
                    </select>
                  </label>

                  <label className="text-xs text-gray-700">
                    <span className="uppercase tracking-wide text-gray-500">Recurrence</span>
                    <select
                      className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5"
                      value={category.recurrence}
                      disabled={isCustomLocked}
                      onChange={(event) =>
                        updateCategory(category.id, (current) => ({
                          ...current,
                          recurrence: event.target.value as TaxBufferCategoryForm["recurrence"],
                        }))
                      }
                    >
                      <option value="weekly">Weekly</option>
                      <option value="fortnightly">Fortnightly</option>
                      <option value="monthly">Monthly</option>
                      <option value="quarterly">Quarterly</option>
                      <option value="annually">Annually</option>
                      <option value="one_off">One-off</option>
                    </select>
                  </label>
                </div>

                {category.calculationMethod === "percentage_profit" ||
                category.calculationMethod === "percentage_revenue" ? (
                  <label className="mt-3 block text-xs text-gray-700">
                    <span className="uppercase tracking-wide text-gray-500">Rate percent</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.1}
                      disabled={isCustomLocked}
                      className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5"
                      value={category.ratePercent ?? 0}
                      onChange={(event) =>
                        updateCategory(category.id, (current) => ({
                          ...current,
                          ratePercent: Math.max(0, Math.min(100, Number(event.target.value) || 0)),
                        }))
                      }
                    />
                  </label>
                ) : null}

                {category.calculationMethod === "fixed_amount" ? (
                  <label className="mt-3 block text-xs text-gray-700">
                    <span className="uppercase tracking-wide text-gray-500">Fixed amount (AUD)</span>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      disabled={isCustomLocked}
                      className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5"
                      value={formatCentsAsAud(category.fixedAmountCents)}
                      onChange={(event) =>
                        updateCategory(category.id, (current) => ({
                          ...current,
                          fixedAmountCents: Math.max(0, Math.round((Number(event.target.value) || 0) * 100)),
                        }))
                      }
                    />
                  </label>
                ) : null}

                {category.calculationMethod === "manual" || category.calculationMethod === "integration" ? (
                  <label className="mt-3 block text-xs text-gray-700">
                    <span className="uppercase tracking-wide text-gray-500">Manual fallback (AUD)</span>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      disabled={isCustomLocked}
                      className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5"
                      value={formatCentsAsAud(category.manualAmountCents)}
                      onChange={(event) =>
                        updateCategory(category.id, (current) => ({
                          ...current,
                          manualAmountCents: Math.max(0, Math.round((Number(event.target.value) || 0) * 100)),
                        }))
                      }
                    />
                  </label>
                ) : null}

                {isCustomLocked ? (
                  <p className="mt-2 text-xs text-amber-700">
                    Custom reserve categories require a higher plan.
                  </p>
                ) : null}
              </div>
            )
          })}
        </div>
      </section>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
        Tax Buffer provides planning estimates based on the financial information available to PaidSoon.
        It is not tax, accounting, or financial advice.
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {saved ? <p className="text-sm text-green-600">Tax Buffer settings saved.</p> : null}

      <button
        type="submit"
        disabled={saving}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
      >
        {saving ? "Saving..." : "Save settings"}
      </button>
    </form>
  )
}
