"use client"

import { useState } from "react"

import type { SpendLeakModuleId } from "@/lib/dashboard/spendleakPresentation"

export function SpendLeakExportButton({ selectedModule }: { selectedModule: SpendLeakModuleId | null }) {
  const [isExporting, setIsExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleExport(format: "csv" | "xlsx") {
    if (isExporting) return
    setIsExporting(true)
    setError(null)

    try {
      const searchParams = new URLSearchParams({ format })
      if (selectedModule) searchParams.set("module", selectedModule)

      const response = await fetch(`/api/spendleak/export?${searchParams.toString()}`)
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error ?? "Failed to generate export")
      }

      const disposition = response.headers.get("Content-Disposition") ?? ""
      const filenameMatch = disposition.match(/filename="([^"]+)"/)
      const filename = filenameMatch?.[1] ?? `paidsoon-spendleak-report.${format}`

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
    <div className="space-y-2">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => handleExport("csv")}
          disabled={isExporting}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isExporting ? "Exporting..." : "Export SpendLeak CSV"}
        </button>
        <button
          type="button"
          onClick={() => handleExport("xlsx")}
          disabled={isExporting}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isExporting ? "Exporting..." : "Export SpendLeak XLSX"}
        </button>
      </div>
      <p className="text-xs text-gray-500">Analysis report only. Not an accounting import/export format.</p>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  )
}
