"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

type ActionType = "mark-invoice-paid" | "pause-invoice" | "resume-invoice" | "trigger-email"

export function CustomerInvoiceActions({
  userId,
  invoiceId,
  status,
}: {
  userId: string
  invoiceId: string
  status: string
}) {
  const router = useRouter()
  const [activeAction, setActiveAction] = useState<ActionType | null>(null)
  const [reason, setReason] = useState("")
  const [stage, setStage] = useState<1 | 2 | 3>(1)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canPause = status === "pending" || status === "snoozed"
  const canResume = status === "paused"
  const canMarkPaid = !["paid", "cancelled", "disputed", "manually_resolved"].includes(status)

  function open(action: ActionType) {
    setActiveAction(action)
    setReason("")
    setError(null)
  }

  async function submit(): Promise<void> {
    if (!activeAction) return
    if (reason.trim().length < 10) {
      setError("Reason must be at least 10 characters.")
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const body: Record<string, unknown> = {
        reason,
        invoiceId,
      }
      if (activeAction === "trigger-email") {
        body.stage = stage
      }

      const response = await fetch(`/api/admin/customers/${userId}/actions/${activeAction}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(payload.error ?? "Action failed")
      }

      setActiveAction(null)
      setReason("")
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          disabled={!canMarkPaid}
          onClick={() => open("mark-invoice-paid")}
          className="rounded border border-gray-700 px-2 py-1 text-[11px] text-gray-200 hover:border-blue-500 disabled:opacity-40"
        >
          Mark Paid
        </button>
        <button
          type="button"
          disabled={!canPause}
          onClick={() => open("pause-invoice")}
          className="rounded border border-gray-700 px-2 py-1 text-[11px] text-gray-200 hover:border-blue-500 disabled:opacity-40"
        >
          Pause
        </button>
        <button
          type="button"
          disabled={!canResume}
          onClick={() => open("resume-invoice")}
          className="rounded border border-gray-700 px-2 py-1 text-[11px] text-gray-200 hover:border-blue-500 disabled:opacity-40"
        >
          Resume
        </button>
        <button
          type="button"
          onClick={() => open("trigger-email")}
          className="rounded border border-gray-700 px-2 py-1 text-[11px] text-gray-200 hover:border-blue-500"
        >
          Force Send
        </button>
      </div>

      {activeAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-lg border border-gray-700 bg-gray-900 p-4">
            <h3 className="text-sm font-semibold text-white mb-2">Confirm action</h3>
            <p className="text-xs text-gray-400 mb-3">Invoice: {invoiceId}</p>

            {activeAction === "trigger-email" && (
              <label className="mb-3 block text-xs text-gray-300">
                Stage
                <select
                  className="mt-1 w-full rounded border border-gray-700 bg-gray-950 px-2 py-1 text-xs"
                  value={stage}
                  onChange={(event) => setStage(Number(event.target.value) as 1 | 2 | 3)}
                >
                  <option value={1}>Stage 1</option>
                  <option value={2}>Stage 2</option>
                  <option value={3}>Stage 3</option>
                </select>
              </label>
            )}

            <label className="mb-2 block text-xs text-gray-300">
              Reason
              <textarea
                autoFocus
                rows={4}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className="mt-1 w-full rounded border border-gray-700 bg-gray-950 px-2 py-1 text-xs"
                placeholder="Explain why this support action is needed"
              />
            </label>

            {error && <p className="mb-2 text-xs text-red-400">{error}</p>}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setActiveAction(null)}
                className="rounded border border-gray-700 px-3 py-1 text-xs text-gray-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={submitting}
                className="rounded bg-blue-600 px-3 py-1 text-xs text-white disabled:opacity-50"
              >
                {submitting ? "Applying..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
