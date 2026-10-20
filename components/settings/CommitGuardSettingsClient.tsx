"use client"

import { useState } from "react"
import { useCommitGuardRefresh } from "@/components/dashboard/commitguard/CommitGuardWorkspaceProvider"
import { COMMIT_GUARD_CURRENCIES } from "@/lib/commitguard/cashContext"
import { CommitGuardSettingsSchema, parseCommitGuardWarningDraft } from "@/lib/commitguard/settingsSchema"

interface CommitGuardSettingsData {
  enabled: boolean
  defaultHorizonDays: number
  safetyBufferMode: "fixed_amount" | "percentage_monthly_commitments" | "weeks_operating_expenses"
  safetyBufferFixedCents: number
  safetyBufferCurrency?: string | null
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
  const [previousSettings, setPreviousSettings] = useState(settings)
  const [dirty, setDirty] = useState<Set<keyof CommitGuardSettingsData>>(() => new Set())
  const [warningDaysText, setWarningDaysText] = useState(settings.renewalWarningDays.join(","))
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshFailed, setRefreshFailed] = useState(false)
  const { refresh, requestMutation } = useCommitGuardRefresh()

  // Adopt refreshed/imported policy only for untouched fields. Background reads
  // must never erase a comma, an empty warning draft, or another unsaved edit.
  if (previousSettings !== settings) {
    setPreviousSettings(settings)
    setForm((current) => ({ ...settings, ...Object.fromEntries(
      [...dirty].map((key) => [key, current[key]]),
    ) }))
    if (!dirty.has("renewalWarningDays")) setWarningDaysText(settings.renewalWarningDays.join(","))
  }

  async function reloadWorkspace(): Promise<void> {
    setSaving(true)
    try { await refresh(); setRefreshFailed(false); setError(null) }
    catch { setRefreshFailed(true); setError("Settings saved, but figures could not refresh. Retry refresh only; do not save again.") }
    finally { setSaving(false) }
  }

  async function saveSettings(event: React.FormEvent) {
    event.preventDefault()
    if (refreshFailed || saving) return
    const renewalWarningDays = parseCommitGuardWarningDraft(warningDaysText)
    const parsed = CommitGuardSettingsSchema.safeParse({ ...form, renewalWarningDays: renewalWarningDays ?? [] })
    const errors: Record<string, string> = {}
    if (!parsed.success) for (const issue of parsed.error.issues) errors[String(issue.path[0])] = issue.message
    if (renewalWarningDays === null) errors.renewalWarningDays = "Enter 1 to 12 comma-separated whole days from 1 to 365. Empty lists are not allowed."
    if (form.detectionConfidenceThreshold === "confirmed") errors.detectionConfidenceThreshold = "Choose low, medium or high; detection cannot infer owner confirmation."
    setFieldErrors(errors)
    if (Object.keys(errors).length || !parsed.success) return
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
    const response = await requestMutation("/api/commitguard/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      // Only edited policy is written; a refreshed partial import cannot be
      // overwritten by unrelated stale controls. Financial inputs never travel here.
      body: JSON.stringify(Object.fromEntries([...dirty].map((key) => [key, parsed.data[key]]))),
    })

    if (!response.ok) {
      const payload = await response.json().catch(() => ({ error: "Failed to save settings" }))
      setError(typeof payload.error === "string" ? payload.error : "Failed to save settings")
      if (payload.error?.fieldErrors) setFieldErrors(Object.fromEntries(Object.entries(payload.error.fieldErrors)
        .filter(([, messages]) => Array.isArray(messages) && messages.length)
        .map(([key, messages]) => [key, (messages as string[]).join(" ")])))
      return
    }

    const payload = await response.json()
    setForm(payload.settings)
    setWarningDaysText(payload.settings.renewalWarningDays.join(","))
    setDirty(new Set())
    setSaved(true)
    await reloadWorkspace()
    } catch { setError("Settings save was not confirmed. Reload current workspace before deciding whether to save again."); setRefreshFailed(true) }
    finally { setSaving(false) }
  }

  return (
    <form noValidate onSubmit={saveSettings} onChange={(event) => {
      const target = event.target
      const name = (target instanceof HTMLInputElement || target instanceof HTMLSelectElement
        ? target.name : "") as keyof CommitGuardSettingsData
      if (name) setDirty((previous) => new Set(previous).add(name))
      setSaved(false)
    }} className="space-y-6">
      <fieldset disabled={saving} className="space-y-6">
      {refreshFailed ? <div role="alert"><p>{saved ? "Settings saved; displayed figures may be stale." : "Reload current saved state before another save. Drafts are retained."}</p><button type="button" disabled={saving} onClick={() => void reloadWorkspace()}>Retry workspace refresh (GET only)</button></div> : null}
      <section className="grid gap-4 md:grid-cols-2">
        <label className="rounded-xl border border-gray-200 bg-white p-4">
          <span className="text-xs uppercase tracking-wide text-gray-500">Module status</span>
          <select
            name="enabled"
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
          <p className="mt-2 text-sm text-gray-600">Disable active protection, automated evaluation, recurring detection and CashPlan contribution. Commitments stay editable and history is retained.</p>
        </label>

        <label className="rounded-xl border border-gray-200 bg-white p-4">
          <span className="text-xs uppercase tracking-wide text-gray-500">Default horizon</span>
          <select
            name="defaultHorizonDays"
            value={form.defaultHorizonDays}
            onChange={(event) => setForm((prev) => ({ ...prev, defaultHorizonDays: Number(event.target.value) }))}
            className="mt-3 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
            <option value={60}>60 days</option>
            <option value={90}>90 days</option>
          </select>
          <p className="mt-2 text-sm text-gray-600">Protection uses this selected horizon. The next-30-days metric and percentage buffer basis remain 30 days.</p>
        </label>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="text-base font-semibold text-gray-900">Safety buffer</h3>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <label className="space-y-2">
            <span className="text-sm font-medium text-gray-700">Mode</span>
            <select
              name="safetyBufferMode"
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
            <span className="text-sm font-medium text-gray-700">Fixed buffer amount (major currency units)</span>
            <input
              name="safetyBufferFixedCents"
              type="number"
              min={0}
              step={0.01}
              value={form.safetyBufferFixedCents / 100}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  safetyBufferFixedCents: Math.round(Number(event.target.value) * 100),
                }))
              }
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-gray-700">Fixed buffer currency</span>
            <select name="safetyBufferCurrency" value={form.safetyBufferCurrency ?? ""}
              onChange={(event) => setForm((previous) => ({ ...previous, safetyBufferCurrency: event.target.value || null }))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900">
              <option value="">Unknown — confirm currency</option>
              {COMMIT_GUARD_CURRENCIES.map((currency) => <option key={currency} value={currency}>{currency.toUpperCase()}</option>)}
            </select>
            <p className="text-sm text-gray-600">Its own currency, never relabeled from cash. A positive legacy amount needs explicit currency confirmation; zero is currency-neutral.</p>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-gray-700">Buffer percent</span>
            <input
              name="safetyBufferPercent"
              type="number"
              min={0}
              max={100}
              step={1}
              value={form.safetyBufferPercent ?? ""}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  safetyBufferPercent: event.target.value === "" ? null : Number(event.target.value),
                }))
              }
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-gray-700">Buffer weeks</span>
            <input name="safetyBufferWeeks" type="number" min={0} max={24} step="any" value={form.safetyBufferWeeks ?? ""}
              onChange={(event) => setForm((previous) => ({ ...previous, safetyBufferWeeks: event.target.value === "" ? null : Number(event.target.value) }))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900" />
            <p className="text-sm text-gray-600">0–24 weeks. Missing is not zero. Four weeks × 200.00 weekly expenses protects 800.00 in the basis currency.</p>
          </label>
        </div>
        <p className="mt-3 text-sm text-gray-600">Enter the weekly operating-expense amount, its independent currency and UTC attestation date in <a className="underline" href="/dashboard/commitguard#cash-inputs">Owner-entered cash inputs</a>. Policy saves do not renew that date or reassign its currency. A missing, mismatched or day-eight stale basis makes free cash unavailable.</p>
      </section>

      <details className="rounded-xl border border-gray-200 bg-white p-4">
        <summary className="cursor-pointer text-base font-semibold text-gray-900">Advanced detection rules</summary>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-medium text-gray-700">Enable recurring detection</span>
            <select
              name="detectRecurringCommitments"
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
              name="detectionMinOccurrences"
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
              name="detectionAmountVariancePercent"
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
              name="detectionIntervalToleranceDays"
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
            {form.detectionConfidenceThreshold === "confirmed" ? <p role="status" className="text-sm text-amber-800">Legacy confirmed threshold requires review. Detection cannot infer owner confirmation. Choose low, medium or high before saving.</p> : null}
            <select
              name="detectionConfidenceThreshold"
              required
              value={form.detectionConfidenceThreshold === "confirmed" ? "" : form.detectionConfidenceThreshold}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  detectionConfidenceThreshold: event.target.value as CommitGuardSettingsData["detectionConfidenceThreshold"],
                }))
              }
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="" disabled>Choose a detection threshold</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-gray-700">Renewal warning days (comma separated)</span>
            <input
              name="renewalWarningDays"
              id="commitguard-warning-days"
              aria-invalid={!!fieldErrors.renewalWarningDays}
              aria-describedby="commitguard-warning-hint commitguard-warning-error"
              type="text"
              value={warningDaysText}
              onChange={(event) => setWarningDaysText(event.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p id="commitguard-warning-hint" className="text-sm text-gray-600">1–12 whole days, each 1–365. Commas and empty text remain drafts until save; an empty list cannot disable alerts. Use alert preferences instead.</p>
            <span id="commitguard-warning-error" role={fieldErrors.renewalWarningDays ? "alert" : undefined} className="text-sm text-red-700">{fieldErrors.renewalWarningDays}</span>
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
                name={key}
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

      {Object.entries(fieldErrors).filter(([key]) => key !== "renewalWarningDays").map(([key, message]) => <p key={key} role="alert" className="text-sm text-red-700">{key}: {message}</p>)}
      {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
      {saved ? <p className="text-sm text-green-600">CommitGuard settings saved.</p> : null}

      <button
        type="submit"
        disabled={saving}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save settings"}
      </button>
      </fieldset>
    </form>
  )
}
