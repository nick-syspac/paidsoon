import Link from "next/link"
import { annualizedRenewalAmount, selectWorkspaceRenewals, renewalPageHref } from "@/lib/commitguard/renewalPresentation"
import { formatCommitGuardMoney } from "@/lib/commitguard/summaryPresentation"
import type { WorkspaceCommitment, WorkspaceQuery, WorkspaceSummary } from "@/lib/commitguard/workspace"

const dateLabel = (value: string): string => new Date(value).toLocaleDateString("en-AU", { timeZone: "UTC" })
const SEVERITY = { urgent: "Urgent", action_required: "Action required", watch: "Watch", info: "Info" }

export function CommitGuardRenewals({ renewals, commitments, params }: {
  renewals: WorkspaceSummary["renewals"]; commitments: WorkspaceCommitment[]; params: WorkspaceQuery
}): React.JSX.Element {
  const page = selectWorkspaceRenewals(renewals, params)
  const byId = new Map(commitments.map((row) => [row.id, row]))
  return <section id="commitguard-renewals" aria-labelledby="commitguard-renewals-heading" tabIndex={-1} className="min-w-0 space-y-3 rounded-xl border bg-white p-4">
    <h2 id="commitguard-renewals-heading" className="font-semibold">Renewals and notice windows</h2>
    <p className="text-sm">Active obligations only; independent of commitment filters. Annualized amounts are source-currency run rates, not forecasts or FX conversions. No mixed-currency total.</p>
    <p role="status">{page.total} renewals · Page {page.page} of {page.totalPages}</p>
    {!page.total ? <p>No renewal dates are currently set on active tracked commitments.</p> : <ol className="space-y-3">{page.items.map((row) => {
      const commitment = byId.get(row.commitmentId)
      const annual = commitment && /^[a-z]{3}$/i.test(commitment.currency) ? annualizedRenewalAmount(commitment.amountCents, commitment.frequency) : null
      const missed = row.daysToNoticeClose < 0
      const days = Math.abs(row.daysToNoticeClose) === 1 ? "day" : "days"
      return <li key={row.commitmentId} className="min-w-0 break-words rounded border p-3" data-renewal-id={row.commitmentId}>
        <h3 className="font-medium">{row.name}</h3>
        <p>Renewal (UTC): {dateLabel(row.renewalDate)} · Notice closes (UTC): {dateLabel(row.noticeCloseDate)}</p>
        <p>Notice period: {commitment?.noticePeriodDays == null ? "Not set (assessment uses 0 days)" : `${commitment.noticePeriodDays} days`} · Auto-renews: {commitment ? commitment.autoRenew ? "Yes" : "No" : "Unavailable"}</p>
        <p>{SEVERITY[row.severity]} · {missed ? `Notice deadline missed by ${Math.abs(row.daysToNoticeClose)} ${days}` : row.daysToNoticeClose === 0 ? "Notice deadline is today" : `${row.daysToNoticeClose} ${days} remaining to act`}</p>
        {commitment ? <p>Source amount: {formatCommitGuardMoney(commitment.amountCents, commitment.currency)} · Frequency: {commitment.frequency.replaceAll("_", " ")}</p> : null}
        <p>Annualized impact: {annual === null || !commitment ? "Unavailable — one-off, unsupported recurrence or incomplete amount context" : `${formatCommitGuardMoney(annual, commitment.currency)} per year (${commitment.currency.toUpperCase()} source currency; ${commitment.frequency.replaceAll("_", " ")})`}</p>
        {commitment && !commitment.archivedAt ? <a className="inline-block py-2 text-blue-700 underline" href={`#commitment-${encodeURIComponent(row.commitmentId)}`}>Edit renewal terms for {row.name}</a> : null}
      </li>
    })}</ol>}
    <nav aria-label="Renewal pagination" className="flex flex-wrap items-center gap-3 text-sm">
      {page.page > 1 ? <Link rel="prev" href={renewalPageHref(params, page.page - 1)} className="rounded border px-3 py-2">Previous renewals</Link> : <span aria-disabled="true">Previous renewals</span>}
      <span aria-current="page">Page {page.page} of {page.totalPages}</span>
      {page.page < page.totalPages ? <Link rel="next" href={renewalPageHref(params, page.page + 1)} className="rounded border px-3 py-2">Next renewals</Link> : <span aria-disabled="true">Next renewals</span>}
    </nav>
  </section>
}