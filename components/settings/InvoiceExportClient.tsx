"use client"

import { useState } from "react"

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "paused", label: "Paused" },
  { value: "snoozed", label: "Snoozed" },
  { value: "sequence_complete", label: "Sequence complete" },
  { value: "paid", label: "Paid" },
  { value: "manually_resolved", label: "Manually resolved" },
]

const PROVIDER_OPTIONS = [
  { value: "stripe", label: "Stripe" },
  { value: "xero", label: "Xero" },
  { value: "myob", label: "MYOB" },
  { value: "spreadsheet_import", label: "Spreadsheet import" },
]

interface InvoiceExportClientProps {
  customers: { id: string; label: string }[]
}

/**
 * Settings "Invoice exports" advanced export form (openspec/changes/add-invoice-export).
 */
export function InvoiceExportClient({ customers }: InvoiceExportClientProps) {
  const [format, setFormat] = useState<"csv" | "xlsx">("csv")
  const [useDateRange, setUseDateRange] = useState(false)
  const [dateField, setDateField] = useState<"due_date" | "created_date">("due_date")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [statuses, setStatuses] = useState<string[]>([])
  const [customerId, setCustomerId] = useState("")
  const [provider, setProvider] = useState("")

  const [isExporting, setIsExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isEmpty, setIsEmpty] = useState(false)

  function toggleStatus(value: string) {
    setStatuses((prev) => (prev.includes(value) ? prev.filter((s) => s !== value) : [...prev, value]))
  }

  async function handleExport() {
    if (isExporting) return
    setIsExporting(true)
    setError(null)
    setIsEmpty(false)

    try {
      const searchParams = new URLSearchParams({ format })
      if (statuses.length > 0) searchParams.set("statuses", statuses.join(","))
      if (customerId) searchParams.set("customerId", customerId)
      if (provider) searchParams.set("provider", provider)
      if (useDateRange) {
        searchParams.set("dateField", dateField)
        if (dateFrom) searchParams.set("dateFrom", dateFrom)
        if (dateTo) searchParams.set("dateTo", dateTo)
      }

      const response = await fetch(`/api/invoices/export?${searchParams.toString()}`)
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(body?.error ?? "Failed to generate export")
      }

      const rowCount = Number(response.headers.get("X-PaidSoon-Export-Row-Count") ?? "0")
      if (rowCount === 0) {
        setIsEmpty(true)
        return
      }

      const disposition = response.headers.get("Content-Disposition") ?? ""
      const filenameMatch = disposition.match(/filename="([^"]+)"/)
      const filename = filenameMatch?.[1] ?? `paidsoon-invoices.${format}`

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

  return (
    <div className="max-w-lg space-y-5">
      <div>
        <h2 className="text-base font-medium text-gray-900">Invoice exports</h2>
        <p className="text-sm text-gray-500">Export your invoices to CSV or XLSX with custom filters.</p>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-gray-700">Format</legend>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="radio" name="format" checked={format === "csv"} onChange={() => setFormat("csv")} />
            CSV
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="radio" name="format" checked={format === "xlsx"} onChange={() => setFormat("xlsx")} />
            XLSX
          </label>
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-gray-700">Statuses</legend>
        <div className="grid grid-cols-2 gap-1">
          {STATUS_OPTIONS.map((option) => (
            <label key={option.value} className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={statuses.includes(option.value)}
                onChange={() => toggleStatus(option.value)}
              />
              {option.label}
            </label>
          ))}
        </div>
        <p className="text-xs text-gray-400">No statuses selected exports all statuses.</p>
      </fieldset>

      <div>
        <label htmlFor="export-customer" className="block text-sm font-medium text-gray-700 mb-1">
          Customer
        </label>
        <select
          id="export-customer"
          value={customerId}
          onChange={(e) => setCustomerId(e.target.value)}
          className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm"
        >
          <option value="">All customers</option>
          {customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="export-provider" className="block text-sm font-medium text-gray-700 mb-1">
          Accounting source
        </label>
        <select
          id="export-provider"
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm"
        >
          <option value="">All sources</option>
          {PROVIDER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="space-y-2">
        <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <input type="checkbox" checked={useDateRange} onChange={(e) => setUseDateRange(e.target.checked)} />
          Filter by date range
        </label>
        {useDateRange && (
          <div className="space-y-2 pl-6">
            <label htmlFor="export-date-field" className="block text-sm text-gray-700">
              Date field
            </label>
            <select
              id="export-date-field"
              value={dateField}
              onChange={(e) => setDateField(e.target.value as "due_date" | "created_date")}
              className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm"
            >
              <option value="due_date">Due date</option>
              <option value="created_date">Created date</option>
            </select>
            <p className="text-xs text-gray-400">
              Invoice date is included in every export but cannot be used as a filter.
            </p>
            <div className="flex gap-2">
              <div>
                <label htmlFor="export-date-from" className="block text-xs text-gray-500">
                  From
                </label>
                <input
                  id="export-date-from"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="border border-gray-300 rounded-md px-3 py-1.5 text-sm"
                />
              </div>
              <div>
                <label htmlFor="export-date-to" className="block text-xs text-gray-500">
                  To
                </label>
                <input
                  id="export-date-to"
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="border border-gray-300 rounded-md px-3 py-1.5 text-sm"
                />
              </div>
            </div>
          </div>
        )}
      </fieldset>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleExport}
          disabled={isExporting}
          className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isExporting ? "Generating…" : "Generate export"}
        </button>
        {error && <span className="text-sm text-red-600">{error}</span>}
        {isEmpty && <span className="text-sm text-gray-500">No invoices match the selected filters.</span>}
      </div>
    </div>
  )
}
