"use client"

import { useState } from "react"

interface AiFlags {
  canRewrite: boolean
  canSetTone: boolean
}

export function AiSettingsClient({ flags }: { flags: AiFlags }) {
  const [text, setText] = useState("")
  const [tone, setTone] = useState("friendly")
  const [rewritten, setRewritten] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleRewrite(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setRewritten(null)

    const res = await fetch("/api/settings/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, tone: flags.canSetTone ? tone : undefined }),
    })
    const data = await res.json()
    setLoading(false)

    if (!res.ok) {
      setError(data.error ?? "Rewrite failed")
      return
    }

    setRewritten(data.rewrittenText)
  }

  return (
    <div className="max-w-lg space-y-4">
      <h2 className="text-base font-medium text-gray-900">AI Message Rewrite</h2>

      {!flags.canRewrite ? (
        <div className="bg-gray-50 border border-gray-200 rounded-md px-4 py-3 text-sm text-gray-600">
          Upgrade to Small Business to use AI rewrite and tone controls.
        </div>
      ) : (
        <form onSubmit={handleRewrite} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Draft message</label>
            <textarea
              rows={5}
              value={text}
              onChange={(e) => setText(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tone</label>
            <select
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              disabled={!flags.canSetTone}
              className="w-full border border-gray-300 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
            >
              <option value="friendly">Friendly</option>
              <option value="firm">Firm</option>
              <option value="final_notice">Final notice</option>
            </select>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {rewritten && (
            <div className="bg-green-50 border border-green-200 rounded-md px-4 py-3 text-sm text-green-800 whitespace-pre-wrap">
              {rewritten}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 text-white text-sm px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Rewriting..." : "Rewrite message"}
          </button>
        </form>
      )}
    </div>
  )
}
