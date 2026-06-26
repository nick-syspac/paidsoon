"use client"

import { useState, useCallback, useRef } from "react"
import { TemplateEditor, TEMPLATE_VARIABLES, type TemplateEditorHandle, type TemplateVariable } from "./TemplateEditor"
import { Spinner } from "@/components/ui/Spinner"
import type { RewriteOutput } from "@/lib/email/ai-rewrite"

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

const STAGE_GUIDANCE: Record<1 | 2 | 3, { tone: string; description: string }> = {
  1: {
    tone: "Gentle Reminder",
    description: "First reminder — keep it friendly and assume the invoice was simply overlooked. Low pressure; give the client the benefit of the doubt.",
  },
  2: {
    tone: "Firm Follow-up",
    description: "Second reminder — acknowledge the previous email was sent and clearly request action. Remain professional but make the urgency clear.",
  },
  3: {
    tone: "Final Notice",
    description: "Final reminder — be direct and urgent. You may reference consequences of non-payment. Include days overdue and a firm deadline for maximum impact.",
  },
}

function TemplatesSidebar({
  stage,
  onInsert,
}: {
  stage: 1 | 2 | 3
  onInsert: (v: TemplateVariable) => void
}) {
  const guidance = STAGE_GUIDANCE[stage]
  const variables = TEMPLATE_VARIABLES.filter((v) => !v.stage3Only || stage === 3)

  return (
    <div className="sticky top-6 space-y-5">
      <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 mb-1">
          {guidance.tone}
        </p>
        <p className="text-sm text-blue-800">{guidance.description}</p>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
          Variables
        </p>
        <div className="space-y-2">
          {variables.map((v) => (
            <button
              key={v.token}
              type="button"
              onClick={() => onInsert(v)}
              className="w-full text-left"
            >
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 hover:bg-blue-200 transition-colors">
                {`{{${v.token}}}`}
              </span>
              {v.description && (
                <span className="ml-2 text-xs text-gray-400">{v.description}</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export function TemplatesClient({ data, canRewrite }: { data: TemplateData; canRewrite: boolean }) {
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
  const editorRef = useRef<TemplateEditorHandle>(null)

  // AI rewrite state
  const [aiVariants, setAiVariants] = useState<RewriteOutput | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)

  const STAGE_TO_TONE: Record<1 | 2 | 3, keyof RewriteOutput> = {
    1: "friendly",
    2: "firm",
    3: "final_notice",
  }

  async function handleAiRewrite() {
    setAiLoading(true)
    setAiError(null)
    setAiVariants(null)
    const res = await fetch("/api/settings/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: textBody, stage }),
    })
    const payload = await res.json().catch(() => ({}))
    setAiLoading(false)
    if (!res.ok) {
      setAiError(payload.error ?? "Rewrite failed")
      return
    }
    setAiVariants({ friendly: payload.friendly, firm: payload.firm, final_notice: payload.final_notice })
  }

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
    setAiVariants(null)
    setAiError(null)
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
    let payload: { error?: unknown; success?: boolean } = {}
    try {
      payload = await res.json()
    } catch {
      // non-JSON response (e.g. unexpected server error)
    }
    setSaving(false)
    if (!res.ok) {
      setError(typeof payload.error === "string" ? payload.error : "Failed to save template")
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
    <div className="max-w-4xl space-y-5">
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
      <div className="grid grid-cols-[3fr_2fr] gap-8 items-start">
      <div>      {!data.canCustomize ? (
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
              ref={editorRef}
              stage={stage}
              htmlBody={htmlBody}
              textBody={textBody}
              onHtmlChange={setHtmlBody}
              onTextChange={setTextBody}
            />
            {canRewrite && (
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => { setAiError(null); handleAiRewrite() }}
                  disabled={aiLoading || saving || loading}
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-purple-300 text-purple-700 bg-purple-50 hover:bg-purple-100 disabled:opacity-50 transition-colors"
                >
                  {aiLoading ? <><Spinner /><span>Rewriting…</span></> : "✦ AI Rewrite"}
                </button>
                {aiError && <p className="mt-1 text-xs text-red-600">{aiError}</p>}
              </div>
            )}
          </div>

          {/* AI diff panel */}
          {aiVariants && (() => {
            const tone = STAGE_TO_TONE[stage]
            const variant = aiVariants[tone]
            const aiHtml = variant.message
              .split(/\n{2,}/)
              .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
              .join("")
            return (
              <div className="rounded-lg border border-purple-200 bg-purple-50 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-purple-700">AI Rewrite Suggestion</p>
                  <button
                    type="button"
                    onClick={() => { setAiVariants(null); setAiError(null) }}
                    className="text-xs text-purple-500 hover:text-purple-700"
                  >
                    ✕ Discard
                  </button>
                </div>

                {/* Side-by-side diff */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1">Current</p>
                    <pre className="text-xs text-gray-700 whitespace-pre-wrap bg-white border border-gray-200 rounded p-2 max-h-48 overflow-y-auto">{textBody}</pre>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-purple-600 mb-1">Suggestion</p>
                    <pre className="text-xs text-gray-700 whitespace-pre-wrap bg-white border border-purple-200 rounded p-2 max-h-48 overflow-y-auto">{variant.message}</pre>
                  </div>
                </div>

                {/* Subject change note */}
                {variant.subject !== subject && (
                  <p className="text-xs text-purple-700 bg-purple-100 rounded px-2 py-1">
                    Subject will change to: <span className="font-medium">{variant.subject}</span>
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => {
                    // eslint-disable-next-line react-hooks/refs
                    editorRef.current?.setContent(aiHtml)
                    setHtmlBody(aiHtml)
                    setTextBody(variant.message)
                    setSubject(variant.subject)
                    setAiVariants(null)
                    setAiError(null)
                  }}
                  className="text-xs px-3 py-1.5 rounded bg-purple-600 text-white hover:bg-purple-700 transition-colors"
                >
                  Apply this suggestion
                </button>
              </div>
            )
          })()}

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
      <TemplatesSidebar
        stage={stage}
        onInsert={(v) => editorRef.current?.insertVariable(v)}
      />
      </div>
    </div>
  )
}
