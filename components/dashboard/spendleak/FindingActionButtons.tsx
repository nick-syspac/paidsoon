"use client"

import { useState } from "react"

type SpendInsightState = "open" | "resolved" | "dismissed" | "snoozed"

type ActionName = "resolve" | "dismiss" | "snooze" | "reopen"

function actionsForState(state: SpendInsightState): ActionName[] {
  if (state === "open") return ["resolve", "dismiss", "snooze"]
  if (state === "snoozed") return ["reopen", "resolve", "dismiss"]
  return ["reopen"]
}

function labelForAction(action: ActionName): string {
  if (action === "resolve") return "Mark resolved"
  if (action === "dismiss") return "Dismiss"
  if (action === "snooze") return "Snooze"
  return "Reopen"
}

export function FindingActionButtons({
  findingId,
  initialState,
}: {
  findingId: string
  initialState: SpendInsightState
}) {
  const [state, setState] = useState<SpendInsightState>(initialState)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const runAction = async (action: ActionName) => {
    setIsSubmitting(true)
    setError(null)
    setNotice(null)

    const previous = state
    if (action === "resolve") setState("resolved")
    if (action === "dismiss") setState("dismissed")
    if (action === "snooze") setState("snoozed")
    if (action === "reopen") setState("open")

    try {
      const res = await fetch(`/api/spend-insights/${findingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error ?? "Unable to update finding")
      }

      const body = (await res.json()) as { finding: { state: SpendInsightState } }
      setState(body.finding.state)
      setNotice(`Updated: ${body.finding.state}`)
    } catch (err) {
      setState(previous)
      setError(err instanceof Error ? err.message : "Unable to update finding")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-gray-600">Current state: <span className="font-medium text-gray-900">{state}</span></p>
      <div className="flex flex-wrap gap-2">
        {actionsForState(state).map((action) => (
          <button
            key={action}
            type="button"
            disabled={isSubmitting}
            onClick={() => runAction(action)}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {labelForAction(action)}
          </button>
        ))}
      </div>
      {notice && <p className="text-sm text-emerald-700">{notice}</p>}
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  )
}
