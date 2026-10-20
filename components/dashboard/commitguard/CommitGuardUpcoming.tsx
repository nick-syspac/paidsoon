import Link from "next/link"
import { formatCommitGuardMoney } from "@/lib/commitguard/summaryPresentation"
import { commitmentPageHref, workspaceQueryString, WORKSPACE_STATUSES, WORKSPACE_ESSENTIALITIES,
  WORKSPACE_FREQUENCIES, WORKSPACE_SOURCES, type WorkspaceQuery, type WorkspaceCommitmentPage } from "@/lib/commitguard/workspaceFilters"

const INPUT = "min-w-0 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
const label = (value: string): string => value.replaceAll("_", " ")
const FILTER_FIELDS = new Set(["search", "category", "status", "essentiality", "frequency", "source", "currency", "duePeriod", "dueFrom", "dueTo", "sortBy", "sortOrder", "page"])

export function CommitGuardUpcoming({ upcoming, params }: { upcoming: WorkspaceCommitmentPage; params: WorkspaceQuery }): React.JSX.Element {
  const preserved = Object.entries(params).filter((entry): entry is [string, string] => !FILTER_FIELDS.has(entry[0]) && typeof entry[1] === "string")
  const reset = workspaceQueryString({ alertPage: params.alertPage, renewalPage: params.renewalPage, eventId: params.eventId, commitmentId: params.commitmentId })
  const selects: Array<{ name: keyof WorkspaceQuery; title: string; empty: string; values: readonly string[] }> = [
    { name: "category", title: "Category", empty: "All categories", values: [...new Set([...upcoming.categories, ...(params.category ? [params.category] : [])])] },
    { name: "status", title: "Status", empty: "Active obligations", values: ["all", ...WORKSPACE_STATUSES] },
    { name: "essentiality", title: "Essentiality", empty: "All essentialities", values: WORKSPACE_ESSENTIALITIES },
    { name: "frequency", title: "Frequency", empty: "All frequencies", values: WORKSPACE_FREQUENCIES },
    { name: "source", title: "Source", empty: "All sources", values: WORKSPACE_SOURCES },
    { name: "currency", title: "Currency", empty: "All currencies", values: [...new Set([...upcoming.currencies, ...(params.currency ? [params.currency] : [])])] },
  ]
  return <section id="commitguard-upcoming" aria-labelledby="commitguard-upcoming-heading" tabIndex={-1} className="min-w-0 space-y-4 rounded-xl border bg-white p-4">
    <h2 id="commitguard-upcoming-heading" className="font-semibold">Upcoming commitments</h2>
    <p id="commitguard-due-help" className="text-sm text-gray-600">Default view includes active, upcoming, ending and review commitments. Choose a status to view historical or paused records. Due filters use the saved next due date in UTC: from is inclusive, before is exclusive. Next N days includes today and excludes day N.</p>
    <form key={workspaceQueryString(params)} action="/dashboard/commitguard#commitguard-upcoming" method="get" aria-label="Commitment filters" className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {preserved.map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
      <label htmlFor="commitguard-search">Search<input id="commitguard-search" name="search" type="search" maxLength={500} defaultValue={params.search ?? ""} className={INPUT} /></label>
      {selects.map(({ name, title, empty, values }) => <label key={name} htmlFor={`commitguard-${name}`}>{title}<select id={`commitguard-${name}`} name={name} defaultValue={params[name] ?? ""} className={INPUT}><option value="">{empty}</option>{values.map((value) => <option key={value} value={value}>{name === "currency" ? value.toUpperCase() : value === "custom" ? "Custom (unsupported)" : value === "all" ? "All statuses" : label(value)}</option>)}</select></label>)}
      <label htmlFor="commitguard-due-period">Due period (UTC)<select id="commitguard-due-period" name="duePeriod" defaultValue={params.duePeriod ?? ""} className={INPUT} aria-describedby="commitguard-due-help"><option value="">Any due date</option>{[7, 30, 60, 90].map((days) => <option key={days} value={days}>Next {days} days</option>)}<option value="overdue">Overdue</option><option value="unscheduled">Unscheduled</option></select></label>
      <label htmlFor="commitguard-due-from">Due from (UTC, inclusive)<input id="commitguard-due-from" name="dueFrom" type="date" defaultValue={params.dueFrom ?? ""} className={INPUT} /></label>
      <label htmlFor="commitguard-due-to">Due before (UTC, exclusive)<input id="commitguard-due-to" name="dueTo" type="date" defaultValue={params.dueTo ?? ""} className={INPUT} /></label>
      <label htmlFor="commitguard-sort">Sort by<select id="commitguard-sort" name="sortBy" defaultValue={params.sortBy ?? "nextDueDate"} className={INPUT}><option value="nextDueDate">Next due date</option><option value="amountCents">Amount (source currency, no FX)</option><option value="updatedAt">Last updated</option><option value="name">Name</option></select></label>
      <label htmlFor="commitguard-order">Sort order<select id="commitguard-order" name="sortOrder" defaultValue={params.sortOrder ?? "asc"} className={INPUT}><option value="asc">Ascending</option><option value="desc">Descending</option></select></label>
      <div className="flex flex-wrap items-center gap-3"><button type="submit" className="rounded border px-3 py-2">Apply filters</button><Link className="py-2 underline" href={`/dashboard/commitguard${reset ? `?${reset}` : ""}#commitguard-upcoming`}>Clear filters</Link></div>
    </form>
    {params.costGuardAlertId ? <p>Filtered by linked Cost Guard alert.</p> : null}
    {params.linkedSpendInsightId ? <p>Filtered by linked SpendLeak insight.</p> : null}
    <p role="status">{upcoming.total} matching commitments · Page {upcoming.page} of {upcoming.totalPages}</p>
    {!upcoming.items.length ? <p>{upcoming.totalCommitments ? "No commitments match these filters. Change or clear filters to see more records." : "No commitments yet. Add a commitment below or review detected candidates."}</p> : <div className="min-w-0 overflow-x-auto" role="region" aria-label="Matching commitments" tabIndex={0}><table className="min-w-full text-sm">
      <caption className="sr-only">Filtered commitments, saved next due dates in UTC</caption>
      <thead><tr>{["Name", "Category", "Due (UTC)", "Amount", "Frequency", "Confidence", "Status", "Essentiality", "Source"].map((heading) => <th key={heading} scope="col" className="p-2 text-left">{heading}</th>)}</tr></thead>
      <tbody>{upcoming.items.map((row) => <tr key={row.id}>
        <td className="p-2 break-words">{row.name}</td><td className="p-2">{row.category}</td><td className="p-2">{row.nextDueDate ? new Date(row.nextDueDate).toLocaleDateString("en-AU", { timeZone: "UTC" }) : "Unscheduled"}</td>
        <td className="p-2">{formatCommitGuardMoney(row.amountCents, row.currency)}</td><td className="p-2">{row.frequency === "custom" ? "Custom (unsupported)" : label(row.frequency)}</td><td className="p-2">{row.confidence}</td><td className="p-2">{row.status}</td><td className="p-2">{row.essentiality}</td><td className="p-2">{label(row.source)}</td>
      </tr>)}</tbody>
    </table></div>}
    <nav aria-label="Commitment pagination" className="flex flex-wrap items-center gap-3 text-sm">
      {upcoming.page > 1 ? <Link rel="prev" className="rounded border px-3 py-2" href={commitmentPageHref(params, upcoming.page - 1)}>Previous commitments</Link> : <span aria-disabled="true">Previous commitments</span>}
      <span aria-current="page">Page {upcoming.page} of {upcoming.totalPages}</span>
      {upcoming.page < upcoming.totalPages ? <Link rel="next" className="rounded border px-3 py-2" href={commitmentPageHref(params, upcoming.page + 1)}>Next commitments</Link> : <span aria-disabled="true">Next commitments</span>}
    </nav>
  </section>
}