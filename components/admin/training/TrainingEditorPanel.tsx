"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { extractSearchTextFromStructuredContent, helpHrefFromSlug } from "@/lib/help/trainingContent"
import type { TrainingLifecycleState } from "@/lib/help/trainingWorkflow"
import { TrainingStateBadge } from "@/components/admin/training/TrainingStateBadge"

interface RevisionItem {
  id: string
  revisionNumber: number
  snapshotState: TrainingLifecycleState
  changeNote: string | null
  actorUserId: string
  restoredFromRevisionId: string | null
  createdAt: string
}

interface TrainingEditorItem {
  id: string
  slug: string
  title: string
  summary: string | null
  audience: "public" | "signed_in"
  lifecycleState: TrainingLifecycleState
  content: Record<string, unknown>
  updatedAt: string
}

interface TrainingEditorPanelProps {
  item: TrainingEditorItem
  revisions: RevisionItem[]
}

export function TrainingEditorPanel({ item, revisions }: TrainingEditorPanelProps) {
  const router = useRouter()

  const [title, setTitle] = useState(item.title)
  const [slug, setSlug] = useState(item.slug)
  const [summary, setSummary] = useState(item.summary ?? "")
  const [audience, setAudience] = useState<"public" | "signed_in">(item.audience)
  const [contentText, setContentText] = useState(JSON.stringify(item.content, null, 2))
  const [changeNote, setChangeNote] = useState("Publish from admin studio")
  const [confirmPublish, setConfirmPublish] = useState(false)
  const [showPreview, setShowPreview] = useState(false)

  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const previewText = useMemo(() => {
    try {
      return extractSearchTextFromStructuredContent(JSON.parse(contentText) as Record<string, unknown>)
    } catch {
      return "Preview unavailable until content JSON is valid."
    }
  }, [contentText])

  async function saveDraft() {
    setError(null)
    setMessage(null)

    let parsedContent: Record<string, unknown>
    try {
      parsedContent = JSON.parse(contentText) as Record<string, unknown>
    } catch {
      setError("Content JSON is invalid")
      return
    }

    setBusyAction("save")
    try {
      const response = await fetch(`/api/admin/training/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          slug,
          summary: summary || null,
          audience,
          content: parsedContent,
        }),
      })

      const body = (await response.json().catch(() => ({}))) as { error?: unknown }
      if (!response.ok) {
        setError(typeof body.error === "string" ? body.error : "Failed to save draft")
        return
      }

      setMessage("Draft saved")
      router.refresh()
    } catch {
      setError("Failed to save draft")
    } finally {
      setBusyAction(null)
    }
  }

  async function submitForReview() {
    setError(null)
    setMessage(null)
    setBusyAction("review")

    try {
      const response = await fetch(`/api/admin/training/${item.id}/submit-review`, {
        method: "POST",
      })
      const body = (await response.json().catch(() => ({}))) as { error?: unknown }
      if (!response.ok) {
        setError(typeof body.error === "string" ? body.error : "Failed to submit for review")
        return
      }

      setMessage("Submitted for review")
      router.refresh()
    } catch {
      setError("Failed to submit for review")
    } finally {
      setBusyAction(null)
    }
  }

  async function publishGuide() {
    if (!confirmPublish) {
      setError("Confirm publish before continuing")
      return
    }

    setError(null)
    setMessage(null)
    setBusyAction("publish")

    try {
      const response = await fetch(`/api/admin/training/${item.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changeNote }),
      })
      const body = (await response.json().catch(() => ({}))) as { error?: unknown }
      if (!response.ok) {
        setError(typeof body.error === "string" ? body.error : "Failed to publish guide")
        return
      }

      setMessage("Guide published")
      router.refresh()
    } catch {
      setError("Failed to publish guide")
    } finally {
      setBusyAction(null)
    }
  }

  async function restoreRevision(revisionId: string) {
    if (!window.confirm("Restore this revision as a new draft?")) {
      return
    }

    setError(null)
    setMessage(null)
    setBusyAction(`restore-${revisionId}`)

    try {
      const response = await fetch(`/api/admin/training/${item.id}/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revisionId }),
      })
      const body = (await response.json().catch(() => ({}))) as { error?: unknown }
      if (!response.ok) {
        setError(typeof body.error === "string" ? body.error : "Failed to restore revision")
        return
      }

      setMessage("Revision restored as draft")
      router.refresh()
    } catch {
      setError("Failed to restore revision")
    } finally {
      setBusyAction(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <TrainingStateBadge state={item.lifecycleState} />
            <span className="text-xs text-gray-400">Updated {new Date(item.updatedAt).toLocaleString()}</span>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowPreview((current) => !current)}
              className="rounded-md border border-gray-700 px-3 py-1.5 text-xs text-gray-200"
            >
              {showPreview ? "Hide Preview" : "Show Preview"}
            </button>
            <a
              href={helpHrefFromSlug(slug)}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border border-gray-700 px-3 py-1.5 text-xs text-gray-200"
            >
              Open Public URL
            </a>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs text-gray-400">Title</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              disabled={item.lifecycleState !== "draft"}
              className="w-full rounded-md border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100 disabled:opacity-60"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-gray-400">Slug</span>
            <input
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
              disabled={item.lifecycleState !== "draft"}
              className="w-full rounded-md border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100 disabled:opacity-60"
            />
          </label>
        </div>

        <label className="mt-4 block">
          <span className="mb-1 block text-xs text-gray-400">Summary</span>
          <textarea
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            rows={2}
            disabled={item.lifecycleState !== "draft"}
            className="w-full rounded-md border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100 disabled:opacity-60"
          />
        </label>

        <label className="mt-4 block">
          <span className="mb-1 block text-xs text-gray-400">Audience</span>
          <select
            value={audience}
            onChange={(event) => setAudience(event.target.value as "public" | "signed_in")}
            disabled={item.lifecycleState !== "draft"}
            className="w-full rounded-md border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100 disabled:opacity-60"
          >
            <option value="signed_in">signed_in</option>
            <option value="public">public</option>
          </select>
        </label>

        <label className="mt-4 block">
          <span className="mb-1 block text-xs text-gray-400">Structured Content (JSON)</span>
          <textarea
            value={contentText}
            onChange={(event) => setContentText(event.target.value)}
            rows={16}
            disabled={item.lifecycleState !== "draft"}
            className="w-full rounded-md border border-gray-700 bg-gray-950 px-3 py-2 text-xs text-gray-100 font-mono disabled:opacity-60"
          />
        </label>

        {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}
        {message ? <p className="mt-3 text-sm text-emerald-400">{message}</p> : null}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={saveDraft}
            disabled={item.lifecycleState !== "draft" || busyAction != null}
            className="rounded-md bg-white px-4 py-2 text-sm font-medium text-gray-900 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busyAction === "save" ? "Saving…" : "Save Draft"}
          </button>

          <button
            type="button"
            onClick={submitForReview}
            disabled={item.lifecycleState !== "draft" || busyAction != null}
            className="rounded-md border border-blue-500/40 bg-blue-500/10 px-4 py-2 text-sm text-blue-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busyAction === "review" ? "Submitting…" : "Submit for Review"}
          </button>
        </div>

        {item.lifecycleState === "review" ? (
          <div className="mt-6 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4">
            <p className="text-sm text-emerald-100">This guide is in review and ready to publish.</p>
            <label className="mt-3 block">
              <span className="mb-1 block text-xs text-emerald-200">Change note</span>
              <input
                value={changeNote}
                onChange={(event) => setChangeNote(event.target.value)}
                className="w-full rounded-md border border-emerald-500/40 bg-gray-950 px-3 py-2 text-sm text-gray-100"
              />
            </label>
            <label className="mt-3 flex items-center gap-2 text-xs text-emerald-100">
              <input
                type="checkbox"
                checked={confirmPublish}
                onChange={(event) => setConfirmPublish(event.target.checked)}
              />
              I confirm this content is approved for customer visibility.
            </label>
            <button
              type="button"
              onClick={publishGuide}
              disabled={busyAction != null}
              className="mt-3 rounded-md bg-emerald-400 px-4 py-2 text-sm font-semibold text-emerald-950 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busyAction === "publish" ? "Publishing…" : "Publish Guide"}
            </button>
          </div>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-5 lg:col-span-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Revision History</h2>
          {revisions.length === 0 ? (
            <p className="mt-3 text-sm text-gray-500">No revisions yet.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {revisions.map((revision) => (
                <li key={revision.id} className="rounded-md border border-gray-800 bg-gray-950 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm text-gray-200">
                      Revision {revision.revisionNumber} ({revision.snapshotState})
                    </p>
                    <button
                      type="button"
                      onClick={() => restoreRevision(revision.id)}
                      disabled={busyAction != null}
                      className="rounded-md border border-gray-700 px-2 py-1 text-xs text-gray-200 disabled:opacity-60"
                    >
                      {busyAction === `restore-${revision.id}` ? "Restoring…" : "Restore as Draft"}
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-gray-400">{new Date(revision.createdAt).toLocaleString()}</p>
                  {revision.changeNote ? (
                    <p className="mt-1 text-xs text-gray-300">{revision.changeNote}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Preview</h2>
          {showPreview ? (
            <article className="prose prose-invert mt-3 max-w-none">
              <h3>{title || "Untitled"}</h3>
              {summary ? <p>{summary}</p> : null}
              <div className="mt-3 whitespace-pre-wrap text-sm text-gray-200">{previewText || "No preview text extracted."}</div>
            </article>
          ) : (
            <p className="mt-3 text-sm text-gray-500">Enable preview to see customer-facing rendering text.</p>
          )}
        </div>
      </div>
    </div>
  )
}
