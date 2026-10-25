import Link from "next/link"
import type { ReactElement } from "react"
import type { CommitGuardSummary } from "@/lib/commitguard/summary"
import { presentCommitGuardSummary } from "@/lib/commitguard/summaryPresentation"

/** Shared actual renderer for the dedicated page and overview. Historical
 * commitment groups remain readable when automated protection is disabled. */
export function CommitGuardCashSummary({ summary }: { summary: CommitGuardSummary }): ReactElement {
  const view = presentCommitGuardSummary(summary)
  return <div className="space-y-4" data-input-revision={summary.inputRevision} data-calculation-revision={summary.calculationRevision}>
    <div role="status" className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
      <p className="font-medium">Input quality: {view.quality} · Safety status: {view.status}</p>
      <p className="mt-1">{view.balanceDescription}</p>
      <p className="mt-1">{view.protectionDescription}</p>
      <p className="mt-1">Cash input revision {summary.inputRevision} · Calculation revision {summary.calculationRevision} · Evaluated {summary.asOf}</p>
      {view.reasons.length ? <ul className="mt-2 list-inside list-disc">{view.reasons.map((reason) => <li key={reason.code}>{reason.label}</li>)}</ul> : null}
      {!summary.enabled ? <p className="mt-2">CommitGuard is disabled. Records are retained; automated protection, detection and forecast contribution are disabled.</p> : null}
      {summary.quality.actions.length ? <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
        {summary.quality.actions.includes("update_cash_context") || summary.quality.actions.includes("update_weekly_expenses") || summary.quality.actions.includes("review_tax_protection")
          ? <Link className="underline" href="/dashboard/commitguard#commitguard-cash-context">Update owner cash / expense / tax inputs</Link> : null}
        <Link className="underline" href="/settings/commitguard">Review CommitGuard settings</Link>
        {summary.quality.actions.includes("review_commitments") || summary.quality.actions.includes("review_coverage")
          ? <Link className="underline" href="/dashboard/commitguard">Review commitments and coverage</Link> : null}
      </div> : null}
    </div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[
        ["Available cash", view.availableCash],
        ["Committed (next 30 days)", view.committedNext30Days],
        [`Protected cash (${summary.selectedHorizonDays} days)`, view.protectedCash],
        [`Free cash (${summary.selectedHorizonDays} days)`, view.freeCash],
      ].map(([label, value]) => <div key={label} className="min-w-0 rounded-xl border border-gray-200 bg-white p-4">
        <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
        <p className="mt-2 break-words text-xl font-semibold text-gray-900">{value}</p>
      </div>)}
    </div>
    <div className="space-y-3">
      {view.groups.length === 0 ? <p className="text-sm text-gray-600">No complete currency-group totals are available. Review the input quality above; no zero total has been assumed.</p> : null}
      {view.groups.map((group) => <section key={group.currency} aria-label={`${group.currency.toUpperCase()} commitment horizons`}>
        <h3 className="text-sm font-semibold text-gray-800">{group.currency.toUpperCase()} commitment horizons{!summary.enabled ? " (retained records, not active protection)" : ""}</h3>
        {!group.supportedForFreeCash ? <p className="text-xs text-amber-800">Stored cents shown in source currency; unsupported for free cash.</p> : null}
        <div className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{group.horizons.map((horizon) => <div key={horizon.days} className="min-w-0 rounded-lg border border-gray-200 bg-white p-3">
          <p className="text-xs text-gray-500">{horizon.days}-day commitments</p>
          <p className="mt-1 break-words font-semibold text-gray-900">{horizon.total}</p>
          <p className="mt-1 break-words text-xs text-gray-600">Confirmed {horizon.confirmed} · Probable {horizon.probable} · Potential {horizon.potential}</p>
        </div>)}</div>
      </section>)}
    </div>
  </div>
}