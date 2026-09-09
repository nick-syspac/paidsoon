"use client"

import { useMemo, useState } from "react"

interface MarginGuardSettings {
  enabled: boolean
  defaultPeriod: "30d" | "3m" | "6m" | "12m" | "fy"
  targetGrossMarginPercent: number
  warningGrossMarginPercent: number
  criticalGrossMarginPercent: number
  minCompletenessPercent: number
  alertBelowWarning: boolean
  alertBelowCritical: boolean
  alertDeterioration: boolean
  alertNegativeMargin: boolean
  alertCustomerMarginWarning: boolean
  alertCostIncrease: boolean
  alertDataQualityWarning: boolean
  alertDigestMode: "daily" | "weekly" | "monthly"
}

interface MarginTargetRow {
  id: string
  scopeType: string
  scopeKey: string | null
  targetGrossMarginPercent: number
  warningGrossMarginPercent: number | null
  criticalGrossMarginPercent: number | null
  isActive: boolean
}

interface SourceStatus {
  id: string
  label: string
  connected: boolean
  lastSyncAt: string | null
  dataRange: string
  status: string
}

interface MarginRuleRow {
  id: string
  name: string
  ruleType: "supplier" | "category" | "account" | "text_match" | "recurring"
  classification: "DIRECT_COST" | "VARIABLE_COST" | "OVERHEAD" | "EXCLUDED" | "UNCLASSIFIED"
  priority: number
  enabled: boolean
}

interface MarginClassificationRow {
  id: string
  sourceType: string
  sourceRecordId: string
  classification: "DIRECT_COST" | "VARIABLE_COST" | "OVERHEAD" | "EXCLUDED" | "UNCLASSIFIED"
  classificationOrigin: string
  updatedAt: string
}

export function MarginGuardSettingsClient({
  initialSettings,
  initialTargets,
  initialRules,
  initialClassifications,
  sources,
}: {
  initialSettings: MarginGuardSettings
  initialTargets: MarginTargetRow[]
  initialRules: MarginRuleRow[]
  initialClassifications: MarginClassificationRow[]
  sources: SourceStatus[]
}) {
  const [settings, setSettings] = useState<MarginGuardSettings>(initialSettings)
  const [targets, setTargets] = useState<MarginTargetRow[]>(initialTargets)
  const [message, setMessage] = useState<string>("")
  const [saving, setSaving] = useState(false)
  const [rules, setRules] = useState<MarginRuleRow[]>(initialRules)
  const [classifications, setClassifications] = useState<MarginClassificationRow[]>(initialClassifications)
  const [classificationFilter, setClassificationFilter] = useState<"" | MarginClassificationRow["classification"]>("")
  const [ruleActionSummary, setRuleActionSummary] = useState<string>("")
  const [ruleForm, setRuleForm] = useState({
    id: "",
    name: "",
    ruleType: "supplier" as MarginRuleRow["ruleType"],
    classification: "DIRECT_COST" as MarginRuleRow["classification"],
    priority: 100,
    enabled: true,
    supplierId: "",
    categoryKey: "",
    accountKey: "",
    includesText: "",
    recurringOnly: false,
  })
  const [targetForm, setTargetForm] = useState({
    scopeType: "customer",
    scopeKey: "",
    targetGrossMarginPercent: settings.targetGrossMarginPercent,
    warningGrossMarginPercent: settings.warningGrossMarginPercent,
    criticalGrossMarginPercent: settings.criticalGrossMarginPercent,
    isActive: true,
  })

  async function loadTargets() {
    const listResponse = await fetch("/api/margin-guard/targets")
    const listData = (await listResponse.json()) as { targets?: MarginTargetRow[] }
    setTargets(listData.targets ?? [])
  }

  async function loadRules() {
    const response = await fetch("/api/margin-guard/rules")
    if (!response.ok) return
    const data = (await response.json()) as { rules?: MarginRuleRow[] }
    setRules(data.rules ?? [])
  }

  async function loadClassifications(selectedClassification?: string) {
    const query = new URLSearchParams()
    query.set("limit", "50")
    if (selectedClassification) query.set("classification", selectedClassification)
    const response = await fetch(`/api/margin-guard/classifications?${query.toString()}`)
    if (!response.ok) return
    const data = (await response.json()) as { classifications?: MarginClassificationRow[] }
    setClassifications(data.classifications ?? [])
  }

  const thresholdError = useMemo(() => {
    if (!(settings.criticalGrossMarginPercent < settings.warningGrossMarginPercent)) {
      return "Critical threshold must be lower than warning threshold."
    }
    if (!(settings.warningGrossMarginPercent < settings.targetGrossMarginPercent)) {
      return "Warning threshold must be lower than target margin."
    }
    return null
  }, [settings])

  async function saveSettings() {
    if (thresholdError) {
      setMessage(thresholdError)
      return
    }

    setSaving(true)
    setMessage("")
    try {
      const response = await fetch("/api/margin-guard/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      })

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null
        setMessage(data?.error ?? "Failed to save MarginGuard settings")
        return
      }

      setMessage("Saved MarginGuard settings.")
    } catch {
      setMessage("Failed to save MarginGuard settings")
    } finally {
      setSaving(false)
    }
  }

  async function createOrganizationTarget() {
    setSaving(true)
    setMessage("")
    try {
      const response = await fetch("/api/margin-guard/targets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scopeType: "organization",
          targetGrossMarginPercent: settings.targetGrossMarginPercent,
          warningGrossMarginPercent: settings.warningGrossMarginPercent,
          criticalGrossMarginPercent: settings.criticalGrossMarginPercent,
          isActive: true,
        }),
      })

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null
        setMessage(data?.error ?? "Failed to update target")
        return
      }

      await loadTargets()
      setMessage("Saved organization target.")
    } catch {
      setMessage("Failed to update target")
    } finally {
      setSaving(false)
    }
  }

  async function saveScopedTarget() {
    if (!targetForm.scopeKey.trim()) {
      setMessage("Scope key is required for scoped target overrides")
      return
    }

    setSaving(true)
    setMessage("")
    try {
      const response = await fetch("/api/margin-guard/targets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scopeType: targetForm.scopeType,
          scopeKey: targetForm.scopeKey.trim(),
          targetGrossMarginPercent: targetForm.targetGrossMarginPercent,
          warningGrossMarginPercent: targetForm.warningGrossMarginPercent,
          criticalGrossMarginPercent: targetForm.criticalGrossMarginPercent,
          isActive: targetForm.isActive,
        }),
      })

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null
        setMessage(data?.error ?? "Failed to save scoped target")
        return
      }

      await loadTargets()
      setMessage("Saved scoped target override.")
    } catch {
      setMessage("Failed to save scoped target")
    } finally {
      setSaving(false)
    }
  }

  async function runRuleAction(action: "save" | "preview" | "apply") {
    setSaving(true)
    setRuleActionSummary("")
    try {
      const response = await fetch("/api/margin-guard/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          limit: 100,
          rule: {
            id: ruleForm.id || undefined,
            name: ruleForm.name || "Untitled rule",
            ruleType: ruleForm.ruleType,
            classification: ruleForm.classification,
            priority: ruleForm.priority,
            enabled: ruleForm.enabled,
            matchConfig: {
              supplierId: ruleForm.supplierId || null,
              categoryKey: ruleForm.categoryKey || null,
              accountKey: ruleForm.accountKey || null,
              includesText: ruleForm.includesText || null,
              recurringOnly: ruleForm.recurringOnly,
            },
          },
        }),
      })

      const data = (await response.json().catch(() => null)) as {
        error?: string
        preview?: unknown[]
        result?: { updatedCount?: number }
        rule?: { id?: string }
      } | null

      if (!response.ok) {
        setRuleActionSummary(data?.error ?? "Rule action failed")
        return
      }

      if (action === "preview") {
        setRuleActionSummary(`Preview found ${data?.preview?.length ?? 0} matching records.`)
      } else if (action === "apply") {
        setRuleActionSummary(`Applied rule to ${data?.result?.updatedCount ?? 0} records.`)
        await loadClassifications(classificationFilter || undefined)
      } else {
        setRuleActionSummary("Rule saved.")
        if (data?.rule?.id) {
          setRuleForm((prev) => ({ ...prev, id: data.rule?.id ?? prev.id }))
        }
      }

      await loadRules()
    } catch {
      setRuleActionSummary("Rule action failed")
    } finally {
      setSaving(false)
    }
  }

  async function setManualClassification(id: string, classification: MarginClassificationRow["classification"]) {
    setSaving(true)
    setMessage("")
    try {
      const response = await fetch(`/api/margin-guard/classifications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classification, reason: "Manual settings override" }),
      })

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null
        setMessage(data?.error ?? "Failed to update classification")
        return
      }

      await loadClassifications(classificationFilter || undefined)
      setMessage("Updated classification override.")
    } catch {
      setMessage("Failed to update classification")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-gray-900">General</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(event) => setSettings((prev) => ({ ...prev, enabled: event.target.checked }))}
            />
            Enable MarginGuard
          </label>
          <label className="text-sm text-gray-700">
            Default period
            <select
              className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
              value={settings.defaultPeriod}
              onChange={(event) =>
                setSettings((prev) => ({ ...prev, defaultPeriod: event.target.value as MarginGuardSettings["defaultPeriod"] }))
              }
            >
              <option value="30d">30 days</option>
              <option value="3m">3 months</option>
              <option value="6m">6 months</option>
              <option value="12m">12 months</option>
              <option value="fy">Financial year</option>
            </select>
          </label>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-gray-900">Margin Targets</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <label className="text-sm text-gray-700">
            Target margin (%)
            <input
              type="number"
              min={0}
              max={99.99}
              step={0.1}
              className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
              value={settings.targetGrossMarginPercent}
              onChange={(event) => setSettings((prev) => ({ ...prev, targetGrossMarginPercent: Number(event.target.value) || 0 }))}
            />
          </label>
          <label className="text-sm text-gray-700">
            Warning threshold (%)
            <input
              type="number"
              min={0}
              max={99.99}
              step={0.1}
              className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
              value={settings.warningGrossMarginPercent}
              onChange={(event) => setSettings((prev) => ({ ...prev, warningGrossMarginPercent: Number(event.target.value) || 0 }))}
            />
          </label>
          <label className="text-sm text-gray-700">
            Critical threshold (%)
            <input
              type="number"
              min={0}
              max={99.99}
              step={0.1}
              className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
              value={settings.criticalGrossMarginPercent}
              onChange={(event) => setSettings((prev) => ({ ...prev, criticalGrossMarginPercent: Number(event.target.value) || 0 }))}
            />
          </label>
        </div>
        {thresholdError ? <p className="mt-2 text-xs text-red-700">{thresholdError}</p> : null}

        <button
          type="button"
          onClick={createOrganizationTarget}
          disabled={saving || Boolean(thresholdError)}
          className="mt-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800 hover:bg-blue-100 disabled:opacity-60"
        >
          Save organization target
        </button>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-2 py-2">Scope</th>
                <th className="px-2 py-2">Key</th>
                <th className="px-2 py-2">Target</th>
                <th className="px-2 py-2">Warning</th>
                <th className="px-2 py-2">Critical</th>
              </tr>
            </thead>
            <tbody>
              {targets.map((target) => (
                <tr key={target.id} className="border-b border-gray-100">
                  <td className="px-2 py-2">{target.scopeType}</td>
                  <td className="px-2 py-2">{target.scopeKey ?? "-"}</td>
                  <td className="px-2 py-2">{target.targetGrossMarginPercent.toFixed(1)}%</td>
                  <td className="px-2 py-2">{target.warningGrossMarginPercent?.toFixed(1) ?? "-"}%</td>
                  <td className="px-2 py-2">{target.criticalGrossMarginPercent?.toFixed(1) ?? "-"}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">Scoped override</p>
          <div className="mt-2 grid gap-2 md:grid-cols-3">
            <label className="text-sm text-gray-700">
              Scope type
              <select
                className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
                value={targetForm.scopeType}
                onChange={(event) => setTargetForm((prev) => ({ ...prev, scopeType: event.target.value }))}
              >
                <option value="customer">Customer</option>
                <option value="product_service">Product/service</option>
                <option value="category">Category</option>
                <option value="project_job">Project/job</option>
              </select>
            </label>
            <label className="text-sm text-gray-700">
              Scope key
              <input
                type="text"
                className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
                value={targetForm.scopeKey}
                onChange={(event) => setTargetForm((prev) => ({ ...prev, scopeKey: event.target.value }))}
                placeholder="e.g. customer-id or category-key"
              />
            </label>
            <label className="text-sm text-gray-700">
              Override target (%)
              <input
                type="number"
                min={0}
                max={99.99}
                step={0.1}
                className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
                value={targetForm.targetGrossMarginPercent}
                onChange={(event) =>
                  setTargetForm((prev) => ({ ...prev, targetGrossMarginPercent: Number(event.target.value) || 0 }))
                }
              />
            </label>
          </div>
          <button
            type="button"
            onClick={saveScopedTarget}
            disabled={saving}
            className="mt-3 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-60"
          >
            Save scoped override
          </button>
          <p className="mt-2 text-xs text-gray-500">
            Inheritance: when no scoped target exists for a record, MarginGuard uses the organization target.
          </p>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-gray-900">Cost Classification And Alerts</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={settings.alertBelowWarning} onChange={(event) => setSettings((prev) => ({ ...prev, alertBelowWarning: event.target.checked }))} /> Alert below warning threshold</label>
          <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={settings.alertBelowCritical} onChange={(event) => setSettings((prev) => ({ ...prev, alertBelowCritical: event.target.checked }))} /> Alert below critical threshold</label>
          <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={settings.alertDeterioration} onChange={(event) => setSettings((prev) => ({ ...prev, alertDeterioration: event.target.checked }))} /> Alert on margin deterioration</label>
          <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={settings.alertNegativeMargin} onChange={(event) => setSettings((prev) => ({ ...prev, alertNegativeMargin: event.target.checked }))} /> Alert on negative margin</label>
          <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={settings.alertCustomerMarginWarning} onChange={(event) => setSettings((prev) => ({ ...prev, alertCustomerMarginWarning: event.target.checked }))} /> Alert on low-margin customers</label>
          <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={settings.alertDataQualityWarning} onChange={(event) => setSettings((prev) => ({ ...prev, alertDataQualityWarning: event.target.checked }))} /> Alert on data quality issues</label>
        </div>
        <label className="mt-3 block text-sm text-gray-700">
          Alert digest frequency
          <select
            className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1 text-sm md:w-56"
            value={settings.alertDigestMode}
            onChange={(event) =>
              setSettings((prev) => ({
                ...prev,
                alertDigestMode: event.target.value as MarginGuardSettings["alertDigestMode"],
              }))
            }
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </label>
        <p className="mt-3 text-xs text-gray-500">Manual classification overrides automatic rules. Use /api/margin-guard/rules for preview/apply actions from operational tooling.</p>

        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <div className="rounded-lg border border-gray-200 p-3">
            <p className="text-sm font-semibold text-gray-900">Rule builder</p>
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              <label className="text-sm text-gray-700">
                Name
                <input
                  type="text"
                  className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
                  value={ruleForm.name}
                  onChange={(event) => setRuleForm((prev) => ({ ...prev, name: event.target.value }))}
                />
              </label>
              <label className="text-sm text-gray-700">
                Type
                <select
                  className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
                  value={ruleForm.ruleType}
                  onChange={(event) =>
                    setRuleForm((prev) => ({ ...prev, ruleType: event.target.value as MarginRuleRow["ruleType"] }))
                  }
                >
                  <option value="supplier">Supplier</option>
                  <option value="category">Category</option>
                  <option value="account">Account</option>
                  <option value="text_match">Text match</option>
                  <option value="recurring">Recurring</option>
                </select>
              </label>
              <label className="text-sm text-gray-700">
                Classification
                <select
                  className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
                  value={ruleForm.classification}
                  onChange={(event) =>
                    setRuleForm((prev) => ({
                      ...prev,
                      classification: event.target.value as MarginRuleRow["classification"],
                    }))
                  }
                >
                  <option value="DIRECT_COST">Direct cost</option>
                  <option value="VARIABLE_COST">Variable cost</option>
                  <option value="OVERHEAD">Overhead</option>
                  <option value="EXCLUDED">Excluded</option>
                  <option value="UNCLASSIFIED">Unclassified</option>
                </select>
              </label>
              <label className="text-sm text-gray-700">
                Priority
                <input
                  type="number"
                  min={1}
                  max={10000}
                  className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
                  value={ruleForm.priority}
                  onChange={(event) => setRuleForm((prev) => ({ ...prev, priority: Number(event.target.value) || 1 }))}
                />
              </label>
              <label className="text-sm text-gray-700">
                Supplier match
                <input
                  type="text"
                  className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
                  value={ruleForm.supplierId}
                  onChange={(event) => setRuleForm((prev) => ({ ...prev, supplierId: event.target.value }))}
                />
              </label>
              <label className="text-sm text-gray-700">
                Includes text
                <input
                  type="text"
                  className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
                  value={ruleForm.includesText}
                  onChange={(event) => setRuleForm((prev) => ({ ...prev, includesText: event.target.value }))}
                />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => void runRuleAction("preview")} disabled={saving} className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-60">Preview</button>
              <button type="button" onClick={() => void runRuleAction("save")} disabled={saving} className="rounded-md bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60">Save rule</button>
              <button type="button" onClick={() => void runRuleAction("apply")} disabled={saving || !ruleForm.id} className="rounded-md bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-60">Apply rule</button>
            </div>
            {ruleActionSummary ? <p className="mt-2 text-xs text-gray-600">{ruleActionSummary}</p> : null}
          </div>

          <div className="rounded-lg border border-gray-200 p-3">
            <p className="text-sm font-semibold text-gray-900">Existing rules</p>
            <div className="mt-2 space-y-2">
              {rules.length === 0 ? (
                <p className="text-sm text-gray-500">No rules configured yet.</p>
              ) : (
                rules.map((rule) => (
                  <button
                    key={rule.id}
                    type="button"
                    className="w-full rounded-md border border-gray-200 p-2 text-left hover:bg-gray-50"
                    onClick={() =>
                      setRuleForm((prev) => ({
                        ...prev,
                        id: rule.id,
                        name: rule.name,
                        ruleType: rule.ruleType,
                        classification: rule.classification,
                        priority: rule.priority,
                        enabled: rule.enabled,
                      }))
                    }
                  >
                    <p className="text-sm font-medium text-gray-900">{rule.name}</p>
                    <p className="text-xs text-gray-500">{rule.ruleType} · {rule.classification} · priority {rule.priority}</p>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-gray-200 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-gray-900">Recent classifications</p>
            <select
              className="rounded-md border border-gray-300 px-2 py-1 text-xs"
              value={classificationFilter}
              onChange={(event) => {
                const value = event.target.value as "" | MarginClassificationRow["classification"]
                setClassificationFilter(value)
                void loadClassifications(value || undefined)
              }}
            >
              <option value="">All classes</option>
              <option value="DIRECT_COST">Direct cost</option>
              <option value="VARIABLE_COST">Variable cost</option>
              <option value="OVERHEAD">Overhead</option>
              <option value="EXCLUDED">Excluded</option>
              <option value="UNCLASSIFIED">Unclassified</option>
            </select>
          </div>

          <div className="mt-2 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-2 py-2">Source</th>
                  <th className="px-2 py-2">Record</th>
                  <th className="px-2 py-2">Class</th>
                  <th className="px-2 py-2">Origin</th>
                  <th className="px-2 py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {classifications.map((row) => (
                  <tr key={row.id} className="border-b border-gray-100">
                    <td className="px-2 py-2">{row.sourceType}</td>
                    <td className="px-2 py-2">{row.sourceRecordId}</td>
                    <td className="px-2 py-2">{row.classification}</td>
                    <td className="px-2 py-2">{row.classificationOrigin}</td>
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-100"
                        onClick={() => void setManualClassification(row.id, "DIRECT_COST")}
                        disabled={saving}
                      >
                        Mark direct cost
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            Manual overrides take precedence over rule-based classifications until manually changed.
          </p>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-gray-900">Data Sources</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-2 py-2">Source</th>
                <th className="px-2 py-2">Connected</th>
                <th className="px-2 py-2">Last sync</th>
                <th className="px-2 py-2">Range</th>
                <th className="px-2 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((source) => (
                <tr key={source.id} className="border-b border-gray-100">
                  <td className="px-2 py-2">{source.label}</td>
                  <td className="px-2 py-2">{source.connected ? "Connected" : "Not connected"}</td>
                  <td className="px-2 py-2">{source.lastSyncAt ? new Date(source.lastSyncAt).toLocaleString("en-AU") : "-"}</td>
                  <td className="px-2 py-2">{source.dataRange}</td>
                  <td className="px-2 py-2">{source.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={saveSettings}
          disabled={saving || Boolean(thresholdError)}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save settings"}
        </button>
        {message ? <p className="text-sm text-gray-700">{message}</p> : null}
      </div>
    </div>
  )
}
