"use client"

import { useState } from "react"

interface TeamInfo {
  tier: string
  seatLimit: number
  currentSeats: number
  availableSeats: number
  teamSeatsImplemented: boolean
}

export function TeamInvitesClient({ initial }: { initial: TeamInfo }) {
  const [email, setEmail] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const teamSeatsUnavailable = !initial.teamSeatsImplemented
  const seatsFull = initial.availableSeats <= 0
  const canInvite = initial.teamSeatsImplemented && !seatsFull

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()

    if (teamSeatsUnavailable) {
      setError("Team seats are coming soon. Invitations are not available yet.")
      return
    }

    if (seatsFull) {
      setError("Seat limit reached for your current plan")
      return
    }

    setSubmitting(true)
    setError(null)
    setMessage(null)

    const res = await fetch("/api/settings/team/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    })

    const data = await res.json()
    setSubmitting(false)

    if (!res.ok) {
      if (data?.code === "feature_not_implemented" || data?.code === "team_seats_not_implemented") {
        setError("Team seats are coming soon. Invitations are not available yet.")
        return
      }

      setError(data.error ?? "Failed to invite member")
      return
    }

    setMessage(data.message ?? "Invite validated")
    setEmail("")
  }

  return (
    <div className="max-w-lg space-y-4">
      <h2 className="text-base font-medium text-gray-900">Team Seats</h2>
      <p className="text-sm text-gray-500">
        Current plan supports {initial.seatLimit} seat{initial.seatLimit > 1 ? "s" : ""}.
      </p>

      {teamSeatsUnavailable && (
        <div className="border border-amber-200 bg-amber-50 rounded-md px-4 py-3 text-sm text-amber-800">
          Team seats are coming soon. You can review seat limits now, but sending invitations is not available yet.
        </div>
      )}

      <div className="border border-gray-200 rounded-md px-4 py-3 text-sm text-gray-700">
        Seats used: {initial.currentSeats}/{initial.seatLimit}
      </div>

      {initial.teamSeatsImplemented ? (
        <form onSubmit={handleInvite} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Invite email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={!canInvite}
              placeholder="teammate@company.com"
              className="w-full border border-gray-300 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {message && <p className="text-sm text-green-600">{message}</p>}

          <button
            type="submit"
            disabled={submitting || !canInvite}
            className="bg-blue-600 text-white text-sm px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {seatsFull ? "Seat limit reached" : submitting ? "Checking seats..." : "Invite member"}
          </button>
        </form>
      ) : (
        <div className="text-sm text-gray-500">
          Invitations will be enabled here once Team seats are implemented.
        </div>
      )}

      {!initial.teamSeatsImplemented && error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
