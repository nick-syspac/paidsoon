"use client"

import { useState } from "react"

const transitions = [
  { action: "acknowledge", label: "Acknowledge" },
  { action: "expected", label: "Mark as expected" },
  { action: "snooze", label: "Snooze" },
  { action: "resolve", label: "Resolve" },
] as const

export function AlertActionPanel({
  alertId,
  currentStatus,
}: {
  alertId: string
  currentStatus: string
}) {
  const [status, setStatus] = useState(currentStatus)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function handleAction(action: (typeof transitions)[number]["action"]) {
    setBusyAction(action)
    setMessage(null)

    const response = await fetch(`/api/cost-guard/alerts/${alertId}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: `Action taken from Cost Guard dashboard (${action})` }),
    })

    setBusyAction(null)

    if (!response.ok) {
      setMessage("This alert could not be updated. Please try again.")
      return
    }

    const data = (await response.json().catch(() => null)) as { alert?: { status?: string } } | null
    if (data?.alert?.status) {
      setStatus(data.alert.status)
    }
    setMessage("Alert updated successfully.")
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Actions</h3>
          <p className="mt-1 text-sm text-gray-600">Current state: {status}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {transitions.map((transition) => (
          <button
            key={transition.action}
            type="button"
            aria-label={transition.label}
            disabled={busyAction !== null}
            onClick={() => handleAction(transition.action)}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busyAction === transition.action ? "Updating..." : transition.label}
          </button>
        ))}

        <button
          type="button"
          aria-label="Start investigation for this alert"
          disabled={busyAction !== null}
          onClick={() => setMessage("Investigation started. Review the underlying spend data and supporting evidence.")}
          className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Investigate
        </button>
      </div>

      {message ? (
        <p className="mt-3 text-sm text-gray-700">{message}</p>
      ) : null}
    </div>
  )
}
