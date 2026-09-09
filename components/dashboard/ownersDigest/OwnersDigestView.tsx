import Link from "next/link"

import type { OwnersDigestHistoryEntry, OwnersDigestSnapshotRecord } from "@/lib/ownersDigest/types"

function statusLabel(status: OwnersDigestSnapshotRecord["status"]): string {
  switch (status) {
    case "critical":
      return "Critical"
    case "action_required":
      return "Action Required"
    case "watch":
      return "Watch"
    case "healthy":
      return "Healthy"
  }
}

function severityLabel(severity: OwnersDigestSnapshotRecord["items"][number]["severity"]): string {
  switch (severity) {
    case "critical":
      return "Critical"
    case "warning":
      return "Warning"
    case "opportunity":
      return "Opportunity"
    case "positive":
      return "Positive"
    case "info":
      return "Info"
  }
}

function formatDateTime(value: Date | string | null): string {
  if (!value) return "Not available"
  const date = typeof value === "string" ? new Date(value) : value
  return date.toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

export function OwnersDigestView({
  digest,
  history,
  showHistory = true,
}: {
  digest: OwnersDigestSnapshotRecord
  history: OwnersDigestHistoryEntry[]
  showHistory?: boolean
}) {
  const needsAttention = digest.items.filter((item) => item.section === "needs_attention")
  const opportunities = digest.items.filter((item) => item.section === "opportunities")
  const positiveChanges = digest.items.filter((item) => item.section === "positive_changes")

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Owner&apos;s Digest</h1>
            <p className="mt-1 text-sm text-gray-600">A prioritised weekly briefing across the modules you currently have enabled.</p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/dashboard/settings/owners-digest"
              className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Settings
            </Link>
          </div>
        </div>

        <div className="mt-5 rounded-xl bg-slate-900 px-5 py-4 text-white">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-300">This period</p>
          <div className="mt-2 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-2xl font-semibold">{statusLabel(digest.status)}</p>
              <p className="mt-2 max-w-2xl text-sm text-slate-200">{digest.summary}</p>
            </div>
            <div className="text-sm text-slate-300">
              <p>Generated {formatDateTime(digest.generatedAt)}</p>
              <p>Data current as of {formatDateTime(digest.dataAsOf)}</p>
            </div>
          </div>
        </div>

        {digest.completenessSummary ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {digest.completenessSummary}
          </div>
        ) : null}
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <h2 className="text-base font-semibold text-gray-900">Needs Your Attention</h2>
            {needsAttention.length === 0 ? (
              <p className="mt-3 text-sm text-gray-600">No material risks require immediate attention right now.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {needsAttention.map((item) => (
                  <article key={item.id} className="rounded-lg border border-gray-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-gray-500">{severityLabel(item.severity)} · {item.source}</p>
                        <h3 className="mt-1 text-sm font-semibold text-gray-900">{item.title}</h3>
                      </div>
                    </div>
                    <p className="mt-2 text-sm text-gray-700">{item.summary}</p>
                    {item.whyItMatters ? <p className="mt-2 text-sm text-gray-600">Why it matters: {item.whyItMatters}</p> : null}
                    <div className="mt-3 flex flex-wrap gap-3 text-sm">
                      {item.recommendedAction ? <span className="text-gray-700">Next: {item.recommendedAction}</span> : null}
                      {item.actionUrl ? <Link href={item.actionUrl} className="font-medium text-blue-700 hover:text-blue-900">View details</Link> : null}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <h2 className="text-base font-semibold text-gray-900">Opportunities</h2>
              {opportunities.length === 0 ? (
                <p className="mt-3 text-sm text-gray-600">No material savings opportunities are highlighted right now.</p>
              ) : (
                <ul className="mt-3 space-y-3 text-sm text-gray-700">
                  {opportunities.map((item) => (
                    <li key={item.id}>
                      <p className="font-medium text-gray-900">{item.title}</p>
                      <p className="mt-1">{item.summary}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <h2 className="text-base font-semibold text-gray-900">Positive Changes</h2>
              {positiveChanges.length === 0 ? (
                <p className="mt-3 text-sm text-gray-600">No material positive changes were recorded in this period.</p>
              ) : (
                <ul className="mt-3 space-y-3 text-sm text-gray-700">
                  {positiveChanges.map((item) => (
                    <li key={item.id}>
                      <p className="font-medium text-gray-900">{item.title}</p>
                      <p className="mt-1">{item.summary}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <h2 className="text-base font-semibold text-gray-900">Key Numbers</h2>
            {digest.metrics.length === 0 ? (
              <p className="mt-3 text-sm text-gray-600">Key numbers will appear once the available source modules have enough data.</p>
            ) : (
              <dl className="mt-4 space-y-3">
                {digest.metrics.map((metric) => (
                  <div key={metric.key} className="flex items-center justify-between gap-3 text-sm">
                    <dt className="text-gray-600">{metric.label}</dt>
                    <dd className="font-medium text-gray-900">{metric.displayValue}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <h2 className="text-base font-semibold text-gray-900">Source Status</h2>
            <ul className="mt-3 space-y-2 text-sm text-gray-700">
              {digest.providers.map((provider) => (
                <li key={provider.source} className="flex items-center justify-between gap-3">
                  <span className="capitalize">{provider.source}</span>
                  <span className="capitalize text-gray-500">{provider.status.replaceAll("_", " ")}</span>
                </li>
              ))}
            </ul>
          </div>

          {showHistory ? (
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <h2 className="text-base font-semibold text-gray-900">History</h2>
              <ul className="mt-3 space-y-3 text-sm text-gray-700">
                {history.map((entry) => (
                  <li key={entry.id} className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-gray-900">{entry.periodLabel}</p>
                      <p className="text-gray-500">{statusLabel(entry.status)}</p>
                    </div>
                    <Link href={`/dashboard/owners-digest/${entry.id}`} className="font-medium text-blue-700 hover:text-blue-900">
                      Open
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  )
}
