"use client"

import { useState } from "react"

const DATASET_OPTIONS = [
  { value: "summary", label: "Summary metrics" },
  { value: "customers", label: "Customer profitability" },
  { value: "alerts", label: "Alert inbox" },
  { value: "opportunities", label: "Opportunity pipeline" },
] as const

const PERIOD_OPTIONS = [
  { value: "30d", label: "Last 30 days" },
  { value: "3m", label: "Last 3 months" },
  { value: "6m", label: "Last 6 months" },
  { value: "12m", label: "Last 12 months" },
  { value: "fy", label: "Financial year" },
] as const

type MarginGuardDataset = (typeof DATASET_OPTIONS)[number]["value"]
type MarginGuardPeriod = (typeof PERIOD_OPTIONS)[number]["value"]

export function MarginGuardExportClient() {
  const [dataset, setDataset] = useState<MarginGuardDataset>("summary")
  const [period, setPeriod] = useState<MarginGuardPeriod>("30d")
  const [format, setFormat] = useState<"csv" | "xlsx">("csv")
  const [isExporting, setIsExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isEmpty, setIsEmpty] = useState(false)

  async function handleExport() {
    if (isExporting) return

    setIsExporting(true)
    setError(null)
    setIsEmpty(false)

    try {
      const params = new URLSearchParams({ format, dataset })
      if (dataset === "summary" || dataset === "customers") {
        params.set("period", period)
      }

      const response = await fetch(`/api/margin-guard/export?${params.toString()}`)
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(body?.error ?? "Failed to generate export")
      }

      const rowCount = Number(response.headers.get("X-PaidSoon-MarginGuard-Export-Row-Count") ?? "0")
      if (rowCount === 0) {
        setIsEmpty(true)
        return
      }

      const disposition = response.headers.get("Content-Disposition") ?? ""
      const filenameMatch = disposition.match(/filename="([^"]+)"/)
      const filename = filenameMatch?.[1] ?? `paidsoon-marginguard-${dataset}.${format}`

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate export")
    } finally {
      setIsExporting(false)
    }
  }

  const showPeriodSelector = dataset === "summary" || dataset === "customers"

  return (
    <div className="max-w-lg space-y-5">
      <div>
        <h2 className="text-base font-medium text-gray-900">MarginGuard exports</h2>
        <p className="text-sm text-gray-500">Export summary, customer, alert, or opportunity datasets to CSV or XLSX.</p>
      </div>

      <div>
        <label htmlFor="margin-export-dataset" className="mb-1 block text-sm font-medium text-gray-700">
          Dataset
        </label>
        <select
          id="margin-export-dataset"
          value={dataset}
          onChange={(event) => setDataset(event.target.value as MarginGuardDataset)}
          className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
        >
          {DATASET_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>

      {showPeriodSelector ? (
        <div>
          <label htmlFor="margin-export-period" className="mb-1 block text-sm font-medium text-gray-700">
            Period
          </label>
          <select
            id="margin-export-period"
            value={period}
            onChange={(event) => setPeriod(event.target.value as MarginGuardPeriod)}
            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
          >
            {PERIOD_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
      ) : null}

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-gray-700">Format</legend>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="radio" name="margin-export-format" checked={format === "csv"} onChange={() => setFormat("csv")} />
            CSV
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="radio" name="margin-export-format" checked={format === "xlsx"} onChange={() => setFormat("xlsx")} />
            XLSX
          </label>
        </div>
      </fieldset>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleExport}
          disabled={isExporting}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isExporting ? "Generating…" : "Generate MarginGuard export"}
        </button>
        {error ? <span className="text-sm text-red-600">{error}</span> : null}
        {isEmpty ? <span className="text-sm text-gray-500">No rows match this selection.</span> : null}
      </div>
    </div>
  )
}
