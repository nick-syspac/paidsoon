"use client"

import { useState } from "react"
import { Spinner } from "@/components/ui/Spinner"

interface RewriteVariant {
  subject: string
  message: string
}

interface RewriteVariants {
  friendly: RewriteVariant
  firm: RewriteVariant
  final_notice: RewriteVariant
}

interface AiFlags {
  canRewrite: boolean
}

const VARIANT_LABELS: { key: keyof RewriteVariants; label: string }[] = [
  { key: "friendly", label: "Friendly" },
  { key: "firm", label: "Firm" },
  { key: "final_notice", label: "Final Notice" },
]

function VariantCard({ label, variant }: { label: string; variant: RewriteVariant }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(variant.message)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex flex-col border border-gray-200 rounded-md p-4 space-y-2">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-xs font-medium text-gray-700">
        <span className="text-gray-400">Subject: </span>
        {variant.subject}
      </p>
      <p className="text-sm text-gray-700 whitespace-pre-wrap flex-1">{variant.message}</p>
      <button
        type="button"
        onClick={handleCopy}
        className="self-start text-xs px-3 py-1.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
      >
        {copied ? "Copied!" : "Copy message"}
      </button>
    </div>
  )
}

export function AiSettingsClient({ flags }: { flags: AiFlags }) {
  const [text, setText] = useState("")
  const [variants, setVariants] = useState<RewriteVariants | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleRewrite(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setVariants(null)

    const res = await fetch("/api/settings/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    })
    const data = await res.json()
    setLoading(false)

    if (!res.ok) {
      setError(data.error ?? "Rewrite failed")
      return
    }

    setVariants({
      friendly: data.friendly,
      firm: data.firm,
      final_notice: data.final_notice,
    })
  }

  return (
    <div className="space-y-4">
      <h2 className="text-base font-medium text-gray-900">AI Message Rewrite</h2>

      {!flags.canRewrite ? (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Here is a sample rewrite preview. Upgrade to unlock AI rewriting.
          </p>

          <div className="relative space-y-3">
            <div className="border border-gray-200 rounded-md px-4 py-3 opacity-50 blur-[0.5px] select-none pointer-events-none">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Your draft</p>
              <p className="text-sm text-gray-700">
                Hi Jamie, invoice INV-1042 is late. Please pay it now.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 opacity-50 blur-[0.5px] select-none pointer-events-none">
              {["Friendly", "Firm", "Final Notice"].map((label) => (
                <div key={label} className="border border-gray-200 rounded-md p-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</p>
                  <p className="text-sm text-gray-700">
                    Hi Jamie, hope you are doing well. Just a quick reminder that invoice INV-1042 is now overdue…
                  </p>
                </div>
              ))}
            </div>

            <div className="absolute inset-0 flex items-center justify-center">
              <div className="bg-white border border-gray-200 rounded-lg shadow-sm px-5 py-4 text-center max-w-xs">
                <p className="text-sm font-semibold text-gray-900 mb-1">Unlock AI message rewrite</p>
                <p className="text-xs text-gray-500 mb-3">Available on Small Business</p>
                <a
                  href="/dashboard/settings/subscription?recommend=small_business&intent=ai_rewrite"
                  className="inline-block bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
                >
                  Upgrade now
                </a>
              </div>
            </div>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-md px-4 py-3 text-xs text-gray-600">
            This is a sample preview. Your real draft and all three rewritten variants will appear here after upgrading.
          </div>
        </div>
      ) : (
        <form onSubmit={handleRewrite} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Draft message</label>
            <textarea
              rows={5}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste your invoice follow-up message here…"
              required
              className="w-full border border-gray-300 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 bg-blue-600 text-white text-sm px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {loading && <Spinner />}
            {loading ? "Rewriting…" : "Rewrite message"}
          </button>

          {variants && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              {VARIANT_LABELS.map(({ key, label }) => (
                <VariantCard key={key} label={label} variant={variants[key]} />
              ))}
            </div>
          )}
        </form>
      )}
    </div>
  )
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
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Here is a sample rewrite preview. Upgrade to unlock AI rewriting and tone controls.
          </p>

          <div className="relative space-y-3">
            <div className="border border-gray-200 rounded-md px-4 py-3 opacity-50 blur-[0.5px] select-none pointer-events-none">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Your draft</p>
              <p className="text-sm text-gray-700">
                Hi Jamie, invoice INV-1042 is late. Please pay it now.
              </p>
            </div>

            <div className="border border-gray-200 rounded-md px-4 py-3 opacity-50 blur-[0.5px] select-none pointer-events-none">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">AI rewrite (friendly)</p>
              <p className="text-sm text-gray-700">
                Hi Jamie, hope you are doing well. Just a quick reminder that invoice INV-1042 is now overdue. If payment has already been sent, please ignore this note. Otherwise, could you confirm when we can expect payment? Thank you.
              </p>
            </div>

            <div className="absolute inset-0 flex items-center justify-center">
              <div className="bg-white border border-gray-200 rounded-lg shadow-sm px-5 py-4 text-center max-w-xs">
                <p className="text-sm font-semibold text-gray-900 mb-1">Unlock AI message rewrite</p>
                <p className="text-xs text-gray-500 mb-3">Available on Small Business</p>
                <a
                  href="/dashboard/settings/subscription?recommend=small_business&intent=ai_rewrite"
                  className="inline-block bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
                >
                  Upgrade now
                </a>
              </div>
            </div>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-md px-4 py-3 text-xs text-gray-600">
            This is a sample preview. Your real draft and rewritten output will appear here after upgrading.
          </div>
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
