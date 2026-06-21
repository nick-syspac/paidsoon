"use client"

import { useState, useCallback } from "react"
import { TemplateEditor } from "./TemplateEditor"

interface StageTemplate {
  subject: string
  htmlBody: string
  textBody: string
  isCustom: boolean
}

interface TemplateData {
  tier: string
  templates: Array<{ id: string; label: string }>
  canCustomize: boolean
  stage: 1 | 2 | 3
  subject: string
  htmlBody: string
  textBody: string
  isCustom: boolean
}

const STAGE_LABELS: Record<1 | 2 | 3, string> = {
  1: "Stage 1 – Gentle Reminder",
  2: "Stage 2 – Firm Follow-up",
  3: "Stage 3 – Final Notice",
}

export function TemplatesClient({ data }: { data: TemplateData }) {
  const [stage, setStage] = useState<1 | 2 | 3>(data.stage)
  const [customFlags, setCustomFlags] = useState<Record<number, boolean>>({
    [data.stage]: data.isCustom,
  })
  const [subject, setSubject] = useState(data.subject)
  const [htmlBody, setHtmlBody] = useState(data.htmlBody)
  const [textBody, setTextBody] = useState(data.textBody)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)

  const loadStage = useCallback(async (s: 1 | 2 | 3) => {
    setLoading(true)
    setMessage(null)
    setError(null)
    try {
      const res = await fetch(`/api/settings/templates?stage=${s}`)
      if (!res.ok) throw new Error("Failed to load template")
      const payload: StageTemplate & { isCustom: boolean } = await res.json()
      setSubject(payload.subject)
      setHtmlBody(payload.htmlBody)
      setTextBody(payload.textBody)
      setCustomFlags((prev) => ({ ...prev, [s]: payload.isCustom }))
    } catch {
      setError("Failed to load template for this stage")
    } finally {
      setLoading(false)
    }
  }, [])

  async function handleStageChange(s: 1 | 2 | 3) {
    setStage(s)
    await loadStage(s)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (subject.trim().length < 3) {
      setError("Subject must be at least 3 characters")
      return
    }
    setSaving(true)
    setMessage(null)
    setError(null)
    const res = await fetch("/api/settings/templates", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage, subject, htmlBody, textBody }),
    })
    const payload = await res.json()
    setSaving(false)
    if (!res.ok) {
      setError(payload.error ?? "Failed to save template")
      return
    }
    setCustomFlags((prev) => ({ ...prev, [stage]: true }))
    setMessage("Template saved successfully")
  }

  async function handleReset() {
    setResetting(true)
    setMessage(null)
    setError(null)
    const res = await fetch(`/api/settings/templates?stage=${stage}`, { method: "DELETE" })
    if (!res.ok) {
      setError("Failed to reset template")
      setResetting(false)
      setConfirmReset(false)
      return
    }
    setCustomFlags((prev) => ({ ...prev, [stage]: false }))
    setConfirmReset(false)
    await loadStage(stage)
    setResetting(false)
    setMessage("Template reset to default")
  }

  return (
    <div className="max-w-2xl space-y-5">
      <h2 className="text-base font-medium text-gray-900">Reminder Templates</h2>
      <p className="text-sm text-gray-500">Plan tier: {data.tier}</p>

      {/* Stage selector */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Reminder stage
        </label>
        <select
          value={stage}
          onChange={(e) => handleStageChange(Number(e.target.value) as 1 | 2 | 3)}
          className="border border-gray-300 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          {([1, 2, 3] as const).map((s) => (
            <option key={s} value={s}>
              {STAGE_LABELS[s]}{customFlags[s] ? " ✓" : ""}
            </option>
          ))}
        </select>
      </div>

      {!data.canCustomize ? (
        <div className="bg-gray-50 border border-gray-200 rounded-md px-4 py-3 text-sm text-gray-600">
          Upgrade to Small Business to edit custom reminder templates.
        </div>
      ) : loading ? (
        <div className="text-sm text-gray-500 py-4">Loading…</div>
      ) : (
        <form onSubmit={handleSave} className="space-y-4">
          {/* Subject */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email subject
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
              minLength={3}
              className="w-full border border-gray-300 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Subject line…"
            />
            <p className="mt-1 text-xs text-gray-400">
              Use the &ldquo;Insert variable&rdquo; button in the body editor to add dynamic values like client name or invoice amount.
            </p>
          </div>

          {/* Body editor — key={stage} forces re-mount on stage change so TipTap
               re-initialises with the new content rather than keeping stale content */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email body
            </label>
            <TemplateEditor
              key={stage}
              stage={stage}
              htmlBody={htmlBody}
              textBody={textBody}
              onHtmlChange={setHtmlBody}
              onTextChange={setTextBody}
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {message && <p className="text-sm text-green-600">{message}</p>}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="bg-blue-600 text-white text-sm px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save template"}
            </button>

            {confirmReset ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Reset to default?</span>
                <button
                  type="button"
                  onClick={handleReset}
                  disabled={resetting}
                  className="text-sm text-red-600 hover:text-red-700 font-medium disabled:opacity-50"
                >
                  {resetting ? "Resetting…" : "Yes, reset"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmReset(false)}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Reset to default
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  )
}
