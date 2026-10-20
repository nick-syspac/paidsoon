import Link from "next/link"
import { alertPageHref, type CommitGuardAlertPageDTO } from "@/lib/commitguard/alertPresentation"

const LABELS = { active: "Active at last evaluation", resolved: "Resolved — history", superseded: "Superseded — history",
  suspended: "Suspended — not current risk", historical: "Historical — not current risk" }

export function CommitGuardAlertHistory({ history, params, error = false }: {
  history: CommitGuardAlertPageDTO | null; params: Record<string, string | string[] | undefined>; error?: boolean
}): React.JSX.Element {
  return <section id="commitguard-alerts" aria-labelledby="commitguard-alerts-heading" className="min-w-0 space-y-4 rounded-xl border border-gray-200 bg-white p-4">
    <h2 id="commitguard-alerts-heading" className="text-base font-semibold">Alerts and history</h2>
    <p className="text-sm text-gray-600">Recorded events, not a live cash-risk assessment. Historical impacts describe the event, not today’s position. No immediate email is promised.</p>
    {error || !history ? <p role="alert">Alert history could not load. <Link href={alertPageHref(params, 1)} className="underline">Retry history</Link></p> : <>
      <p role="status" className="text-sm">{history.evaluation.available ? "Evaluation available" : "Current evaluation unavailable or awaiting refresh"} · Last evaluated: {history.evaluation.lastEvaluatedAt ?? "Not yet evaluated"}</p>
      {!history.eventFound ? <p role="status">Requested event is unavailable. Showing your alert history.</p> : null}
      {history.alerts.length === 0 ? <p>No alerts recorded yet. Saved alerts will appear here after evaluation or detection.</p> : <ol className="space-y-3">
        {history.alerts.map((alert) => <li key={alert.id} id={`event-${alert.id}`} tabIndex={-1} className="min-w-0 scroll-mt-4 break-words rounded-lg border border-gray-200 p-3 focus:outline-2 focus:outline-blue-600">
          <div className="flex flex-wrap items-start justify-between gap-2"><h3 className="font-medium">{alert.title}</h3><span className="text-sm font-semibold">{alert.severity === "critical" ? "Critical" : alert.severity === "warning" ? "Warning" : alert.severity === "watch" ? "Watch" : "Info"}</span></div>
          <p className="text-sm font-medium">{LABELS[alert.relevance]}</p>
          <p className="text-sm">Recorded impact: {alert.impact}</p><p className="text-sm">{alert.context}</p>
          <p className="text-xs text-gray-600">Event time: {alert.occurredAt ? <time dateTime={alert.occurredAt}>{alert.occurredAt} (UTC)</time> : "Unknown"}{alert.resolvedAt ? ` · Resolved/ended ${alert.resolvedAt} (UTC)` : ""}</p>
          {alert.href && alert.action ? <Link href={alert.href} className="mt-2 inline-block py-2 text-sm text-blue-700 underline">{alert.action}</Link> : <p className="text-xs">Related record unavailable.</p>}
          <Link href={`/dashboard/commitguard?eventId=${encodeURIComponent(alert.id)}#event-${encodeURIComponent(alert.id)}`} className="ml-3 inline-block py-2 text-sm underline">Link to event</Link>
        </li>)}
      </ol>}
      <nav aria-label="Alert history pagination" className="flex flex-wrap items-center gap-3 text-sm">
        {history.page > 1 ? <Link rel="prev" href={alertPageHref(params, history.page - 1)} className="rounded border px-3 py-2">Previous alerts</Link> : <span aria-disabled="true">Previous alerts</span>}
        <span>Page {history.page} of {history.totalPages} · {history.total} alerts</span>
        {history.page < history.totalPages ? <Link rel="next" href={alertPageHref(params, history.page + 1)} className="rounded border px-3 py-2">Next alerts</Link> : <span aria-disabled="true">Next alerts</span>}
      </nav>
    </>}
  </section>
}