"use client"

import { useState } from "react"

export default function PromiseForm({
  token,
  invoiceId: _invoiceId,
  existingDate,
}: {
  token: string
  invoiceId: string
  existingDate?: string
}) {
  const today = new Date().toISOString().split("T")[0]
  const [promisedPayBy, setPromisedPayBy] = useState(existingDate ?? "")
  const [clientNotes, setClientNotes] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!promisedPayBy) {
      setError("Please select a date.")
      return
    }
    if (promisedPayBy < today) {
      setError("Please choose a future date.")
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`/api/promise/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          promisedPayBy: new Date(promisedPayBy).toISOString(),
          clientNotes: clientNotes.trim() || undefined,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? "Something went wrong. Please try again.")
      } else {
        setDone(true)
      }
    } catch {
      setError("Could not connect. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <div className="text-center py-4">
        <div className="text-3xl mb-3">🙌</div>
        <p className="font-medium text-gray-900">Thanks — we&apos;ve let them know.</p>
        <p className="text-sm text-gray-500 mt-1">
          Your commitment has been recorded. We&apos;ll be in touch if anything
          changes.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          I will pay by
        </label>
        <input
          type="date"
          min={today}
          value={promisedPayBy}
          onChange={(e) => setPromisedPayBy(e.target.value)}
          required
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Note (optional)
        </label>
        <textarea
          value={clientNotes}
          onChange={(e) => setClientNotes(e.target.value)}
          maxLength={500}
          rows={3}
          placeholder="e.g. Waiting on approval — will transfer on Friday"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
      </div>

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2.5 rounded-lg disabled:opacity-50 transition-colors"
      >
        {loading ? "Submitting…" : "Confirm commitment"}
      </button>
    </form>
  )
}
