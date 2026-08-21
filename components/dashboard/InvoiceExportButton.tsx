"use client"

import { useState } from "react"

interface InvoiceExportButtonProps {
  overviewFilter?: string | null
}

/**
 * Dashboard invoices-screen export control (openspec/changes/add-invoice-export).
 * Downloads the current status bucket + overview-card filter as CSV or XLSX
 * via GET /api/invoices/export.
 */
export function InvoiceExportButton({ overviewFilter }: InvoiceExportButtonProps) {
  const [isExporting, setIsExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleExport(format: "csv" | "xlsx") {
    if (isExporting) return
    setIsExporting(true)
    setError(null)
    try {
      const searchParams = new URLSearchParams({ format, statusBucket: "active" })
      if (overviewFilter) searchParams.set("overviewFilter", overviewFilter)

      const response = await fetch(`/api/invoices/export?${searchParams.toString()}`)
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(body?.error ?? "Failed to generate export")
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
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => handleExport("csv")}
          disabled={isExporting}
          className="text-sm bg-white text-gray-700 border border-gray-300 px-3 py-1.5 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isExporting ? "Exporting…" : "Export CSV"}
        </button>
        <button
          type="button"
          onClick={() => handleExport("xlsx")}
          disabled={isExporting}
          className="text-sm bg-white text-gray-700 border border-gray-300 px-3 py-1.5 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isExporting ? "Exporting…" : "Export XLSX"}
        </button>
      </div>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  )
}
