"use client"

import { useState } from "react"

export function CommitGuardSettingsTransferClient() {
  const [jsonValue, setJsonValue] = useState("")
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function exportSettings() {
    setLoading(true)
    setError(null)
    setMessage(null)

    try {
      const response = await fetch("/api/commitguard/settings")
      if (!response.ok) {
        throw new Error("Failed to export CommitGuard settings")
      }

      const payload = await response.json()
      setJsonValue(JSON.stringify(payload.settings ?? {}, null, 2))
      setMessage("Settings exported.")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to export settings")
    } finally {
      setLoading(false)
    }
  }

  async function importSettings() {
    setLoading(true)
    setError(null)
    setMessage(null)

    try {
      const parsed = JSON.parse(jsonValue)
      const response = await fetch("/api/commitguard/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: "Failed to import settings" }))
        throw new Error(typeof payload.error === "string" ? payload.error : "Failed to import settings")
      }

      setMessage("Settings imported.")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import settings")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="text-base font-medium text-gray-900">CommitGuard settings import / export</h2>
      <p className="text-sm text-gray-600">
        Export your CommitGuard settings to JSON, or paste a previously exported JSON blob to restore your configuration.
      </p>

      <textarea
        value={jsonValue}
        onChange={(event) => setJsonValue(event.target.value)}
        rows={10}
        className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-xs text-gray-900"
        placeholder="{}"
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={exportSettings}
          disabled={loading}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {loading ? "Working..." : "Export settings"}
        </button>
        <button
          type="button"
          onClick={importSettings}
          disabled={loading || jsonValue.trim().length === 0}
          className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Import settings
        </button>
      </div>

      {message ? <p className="text-sm text-green-600">{message}</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  )
}
