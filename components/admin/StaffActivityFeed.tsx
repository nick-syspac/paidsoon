"use client"

import { useEffect, useState } from "react"

type FeedItem = {
  id: string
  kind: "search" | "session" | "action"
  action: string
  targetUserId: string | null
  targetLabel: string | null
  reason: string | null
  createdAt: string
  sessionId: string | null
  duration: number | null
  actionCount: number | null
  detailHref: string
  details?: Record<string, unknown> | null
}

type FeedGroup = {
  label: string
  items: FeedItem[]
}

type ActivityFeedResponse = {
  summary: {
    customers: number
    searches: number
    impersonations: number
    actions: number
  }
  groups: FeedGroup[]
}

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  })
}

function renderTitle(item: FeedItem): string {
  if (item.kind === "search") {
    const query = typeof item.details?.query === "string" ? item.details.query : "search"
    return `Customer search: ${query}`
  }

  if (item.kind === "session") {
    const target = item.targetLabel ?? "customer"
    return `Impersonation session: ${target}`
  }

  const action = item.action.replace(/_/g, " ")
  const target = item.targetLabel ? ` for ${item.targetLabel}` : ""
  return `${action}${target}`
}

export function StaffActivityFeed({ days = 2, limit = 20 }: { days?: number; limit?: number }) {
  const [data, setData] = useState<ActivityFeedResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)

      try {
        const resp = await fetch(`/api/admin/activity-feed?days=${days}&limit=${limit}`)
        if (!resp.ok) {
          throw new Error(`Failed to load activity feed (${resp.status})`)
        }

        const body = (await resp.json()) as ActivityFeedResponse
        if (!cancelled) setData(body)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load activity feed")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [days, limit])

  if (loading) {
    return (
      <section className="rounded-lg border border-gray-800 bg-gray-900 p-4">
        <h2 className="text-sm font-semibold text-white mb-2">Staff Activity</h2>
        <p className="text-xs text-gray-400">Loading activity feed...</p>
      </section>
    )
  }

  if (error) {
    return (
      <section className="rounded-lg border border-gray-800 bg-gray-900 p-4">
        <h2 className="text-sm font-semibold text-white mb-2">Staff Activity</h2>
        <p className="text-xs text-red-400">{error}</p>
      </section>
    )
  }

  if (!data) return null

  return (
    <section className="rounded-lg border border-gray-800 bg-gray-900 p-4">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-sm font-semibold text-white">Staff Activity</h2>
          <p className="text-xs text-gray-400 mt-1">
            You&apos;ve worked with {data.summary.customers} customers today ({data.summary.searches} searches, {data.summary.impersonations} impersonations, {data.summary.actions} actions)
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {data.groups.length === 0 && <p className="text-xs text-gray-500">No activity in this window.</p>}
        {data.groups.map((group) => (
          <div key={group.label}>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{group.label}</h3>
            <div className="space-y-2">
              {group.items.map((item) => (
                <a
                  key={item.id}
                  href={item.detailHref}
                  className="block rounded border border-gray-800 bg-gray-950 px-3 py-2 hover:border-gray-700"
                >
                  <p className="text-sm text-gray-100">{renderTitle(item)}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {formatTime(item.createdAt)}
                    {item.duration != null ? ` | Duration: ${Math.max(1, Math.round(item.duration / 60))}m` : ""}
                    {item.actionCount != null ? ` | Actions: ${item.actionCount}` : ""}
                    {item.reason ? ` | Reason: ${item.reason}` : ""}
                  </p>
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
