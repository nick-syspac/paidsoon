"use client"

import { useState } from "react"

interface TemplateData {
  tier: string
  templates: Array<{ id: string; label: string }>
  canCustomize: boolean
}

export function TemplatesClient({ data }: { data: TemplateData }) {
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMessage(null)
    setError(null)

    const res = await fetch("/api/settings/templates", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, body }),
    })
    const payload = await res.json()
    setSaving(false)

    if (!res.ok) {
      setError(payload.error ?? "Failed to save template")
      return
    }

    setMessage("Custom template accepted")
    setSubject("")
    setBody("")
  }

  return (
    <div className="max-w-lg space-y-4">
      <h2 className="text-base font-medium text-gray-900">Reminder Templates</h2>
      <p className="text-sm text-gray-500">Plan tier: {data.tier}</p>

      <div className="border border-gray-200 rounded-md px-4 py-3">
        <p className="text-sm font-medium text-gray-800 mb-2">Available templates</p>
        <ul className="text-sm text-gray-600 space-y-1">
          {data.templates.map((template) => (
            <li key={template.id}>• {template.label}</li>
          ))}
        </ul>
      </div>

      {!data.canCustomize ? (
        <div className="bg-gray-50 border border-gray-200 rounded-md px-4 py-3 text-sm text-gray-600">
          Upgrade to Small Business to edit custom reminder templates.
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Template subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Template body</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              required
              rows={5}
              className="w-full border border-gray-300 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {message && <p className="text-sm text-green-600">{message}</p>}

          <button
            type="submit"
            disabled={saving}
            className="bg-blue-600 text-white text-sm px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save template"}
          </button>
        </form>
      )}
    </div>
  )
}
