"use client"

import { useState } from "react"

type DbCheckResult = {
  ok: boolean
  message: string
  latencyMs?: number
  error?: string
  checkedAt?: string
}

export default function DebugDbCheckButton() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<DbCheckResult | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)

  async function runCheck() {
    setLoading(true)
    setFetchError(null)
    setResult(null)

    try {
      const response = await fetch("/api/diagnostics/db-check", { cache: "no-store" })
      const data: DbCheckResult = await response.json()
      setResult(data)
    } catch {
      setFetchError("Request failed — could not reach the diagnostics endpoint.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mt-6 flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={runCheck}
        disabled={loading}
        className="border border-amber-400 bg-amber-50 text-amber-800 px-4 py-2 rounded-md text-xs font-medium hover:bg-amber-100 disabled:opacity-60"
      >
        {loading ? "Testing database connection…" : "[DEBUG] Test database connection"}
      </button>

      {(result || fetchError) && (
        <pre className="w-full max-w-xl text-left text-xs bg-gray-900 text-gray-100 rounded-md p-4 overflow-x-auto whitespace-pre-wrap">
          {fetchError
            ? fetchError
            : JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  )
}
