"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

interface CreatePayload {
  title: string
  slug: string
  summary: string
  audience: "public" | "signed_in"
  content: string
}

export function TrainingCreateForm() {
  const router = useRouter()

  const [payload, setPayload] = useState<CreatePayload>({
    title: "",
    slug: "",
    summary: "",
    audience: "signed_in",
    content: '{"type":"doc","content":[]}',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    let parsedContent: Record<string, unknown>
    try {
      parsedContent = JSON.parse(payload.content) as Record<string, unknown>
    } catch {
      setError("Content JSON is invalid")
      return
    }

    setSubmitting(true)
    try {
      const response = await fetch("/api/admin/training", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: payload.title,
          slug: payload.slug,
          summary: payload.summary || undefined,
          audience: payload.audience,
          content: parsedContent,
        }),
      })

      const body = (await response.json().catch(() => ({}))) as {
        error?: unknown
        item?: { id: string }
      }

      if (!response.ok || !body.item?.id) {
        setError(typeof body.error === "string" ? body.error : "Failed to create guide")
        return
      }

      router.push(`/admin/training/${body.item.id}`)
      router.refresh()
    } catch {
      setError("Failed to create guide")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-gray-800 bg-gray-900/60 p-5">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs text-gray-400">Title</span>
          <input
            required
            value={payload.title}
            onChange={(event) => setPayload((current) => ({ ...current, title: event.target.value }))}
            className="w-full rounded-md border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs text-gray-400">Slug</span>
          <input
            required
            value={payload.slug}
            onChange={(event) => setPayload((current) => ({ ...current, slug: event.target.value }))}
            placeholder="connect-xero"
            className="w-full rounded-md border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100"
          />
        </label>
      </div>

      <label className="block">
        <span className="mb-1 block text-xs text-gray-400">Summary</span>
        <textarea
          value={payload.summary}
          onChange={(event) => setPayload((current) => ({ ...current, summary: event.target.value }))}
          rows={2}
          className="w-full rounded-md border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-xs text-gray-400">Audience</span>
        <select
          value={payload.audience}
          onChange={(event) =>
            setPayload((current) => ({
              ...current,
              audience: event.target.value as "public" | "signed_in",
            }))
          }
          className="w-full rounded-md border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100"
        >
          <option value="signed_in">signed_in</option>
          <option value="public">public</option>
        </select>
      </label>

      <label className="block">
        <span className="mb-1 block text-xs text-gray-400">Structured Content (JSON)</span>
        <textarea
          value={payload.content}
          onChange={(event) => setPayload((current) => ({ ...current, content: event.target.value }))}
          rows={14}
          className="w-full rounded-md border border-gray-700 bg-gray-950 px-3 py-2 text-xs text-gray-100 font-mono"
        />
      </label>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-white px-4 py-2 text-sm font-medium text-gray-900 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? "Creating…" : "Create Draft"}
      </button>
    </form>
  )
}
