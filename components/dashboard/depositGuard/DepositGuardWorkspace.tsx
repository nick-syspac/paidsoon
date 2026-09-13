import Link from "next/link"

export interface DepositGuardWorkspaceJobRow {
  id: string
  name: string
  description: string | null
  reference: string | null
  customerId: string | null
  workStatus: string
  paymentStatus: string
  commencementBlocked: boolean
  outstandingAmountCents: number
}

export interface DepositGuardWorkspaceRequestRow {
  jobId: string
  status: string
  dueDate: Date
}

export interface DepositGuardWorkspaceProps {
  activeJobCount: number
  blockedJobCount: number
  outstandingCents: number
  overdueRequestCount: number
  filteredJobCount: number
  totalJobCount: number
  search: string
  statusFilter: string
  paymentStatusFilter: string
  canCreateRequests: boolean
  jobs: DepositGuardWorkspaceJobRow[]
  requestCountsByJobId: Record<string, number>
  nextRequestByJobId: Record<string, Date | null>
}

function formatAudCents(value: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(value / 100)
}

function formatDate(value: Date | null | undefined): string {
  if (!value) return "Not scheduled"
  return value.toLocaleDateString("en-AU")
}

function buildFilterHref(input: {
  search: string
  statusFilter: string
  paymentStatusFilter: string
  updates: Record<string, string | undefined>
}): string {
  const params = new URLSearchParams()
  if (input.search) params.set("search", input.search)
  if (input.statusFilter) params.set("status", input.statusFilter)
  if (input.paymentStatusFilter) params.set("paymentStatus", input.paymentStatusFilter)
  for (const [key, value] of Object.entries(input.updates)) {
    if (value) params.set(key, value)
    else params.delete(key)
  }
  const query = params.toString()
  return query ? `/dashboard/deposit-guard?${query}` : "/dashboard/deposit-guard"
}

export function DepositGuardWorkspace({
  activeJobCount,
  blockedJobCount,
  outstandingCents,
  overdueRequestCount,
  filteredJobCount,
  totalJobCount,
  search,
  statusFilter,
  paymentStatusFilter,
  canCreateRequests,
  jobs,
  requestCountsByJobId,
  nextRequestByJobId,
}: DepositGuardWorkspaceProps) {
  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">DepositGuard</h1>
            <p className="mt-1 text-sm text-gray-600">
              Track deposit jobs, request activity, overdue balances, and commencement-blocked work in one place.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/dashboard/deposit-guard/new"
              className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Create job
            </Link>
            <Link
              href="/dashboard/settings"
              className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Settings
            </Link>
            <Link
              href="/dashboard/settings/import-export"
              className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Import / export
            </Link>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <p className="text-xs uppercase tracking-wide text-gray-500">Active jobs</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">{activeJobCount}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <p className="text-xs uppercase tracking-wide text-gray-500">Blocked work</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">{blockedJobCount}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <p className="text-xs uppercase tracking-wide text-gray-500">Outstanding deposit</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">{formatAudCents(outstandingCents)}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <p className="text-xs uppercase tracking-wide text-gray-500">Overdue requests</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">{overdueRequestCount}</p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Filter jobs</h2>
            <p className="mt-1 text-sm text-gray-600">
              Search by customer, reference, or description. Filter by workflow and payment status.
            </p>
          </div>
          <form className="flex flex-col gap-2 sm:flex-row sm:flex-wrap" action="/dashboard/deposit-guard" method="get">
            <input
              name="search"
              defaultValue={search}
              placeholder="Search jobs"
              className="min-w-0 rounded-md border border-gray-300 px-3 py-2 text-sm outline-none ring-0 placeholder:text-gray-400 focus:border-blue-500"
            />
            <select
              name="status"
              defaultValue={statusFilter}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
            >
              <option value="">All statuses</option>
              <option value="open">Open</option>
              <option value="blocked">Blocked</option>
              <option value="draft">Draft</option>
              <option value="requested">Requested</option>
              <option value="viewed">Viewed</option>
              <option value="partially_paid">Partially paid</option>
              <option value="paid">Paid</option>
              <option value="overdue">Overdue</option>
              <option value="cancelled">Cancelled</option>
              <option value="expired">Expired</option>
            </select>
            <select
              name="paymentStatus"
              defaultValue={paymentStatusFilter}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
            >
              <option value="">All payment states</option>
              <option value="draft">Draft</option>
              <option value="requested">Requested</option>
              <option value="viewed">Viewed</option>
              <option value="partially_paid">Partially paid</option>
              <option value="paid">Paid</option>
              <option value="overdue">Overdue</option>
              <option value="cancelled">Cancelled</option>
              <option value="expired">Expired</option>
            </select>
            <button
              type="submit"
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              Apply
            </button>
            <Link
              href="/dashboard/deposit-guard"
              className="rounded-md border border-gray-300 px-4 py-2 text-center text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Reset
            </Link>
          </form>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium">
          <Link href={buildFilterHref({ search, statusFilter, paymentStatusFilter, updates: { status: "" } })} className="rounded-full border border-gray-300 px-3 py-1 text-gray-700 hover:bg-gray-50">
            Clear status
          </Link>
          <Link href={buildFilterHref({ search, statusFilter, paymentStatusFilter, updates: { paymentStatus: "" } })} className="rounded-full border border-gray-300 px-3 py-1 text-gray-700 hover:bg-gray-50">
            Clear payment state
          </Link>
          <Link href={buildFilterHref({ search, statusFilter, paymentStatusFilter, updates: { search: "" } })} className="rounded-full border border-gray-300 px-3 py-1 text-gray-700 hover:bg-gray-50">
            Clear search
          </Link>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-gray-900">Jobs</h2>
          <p className="text-xs text-gray-500">
            {filteredJobCount} of {totalJobCount} shown
          </p>
        </div>

        {!canCreateRequests ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Request management is not yet enabled for this tier. You can still review job health and blocked-work signals here.
          </div>
        ) : null}

        {jobs.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center">
            <p className="text-sm font-medium text-gray-800">No jobs match this view yet</p>
            <p className="mt-1 text-sm text-gray-600">
              Adjust the filters or create a new DepositGuard job from the workflow once you’re ready.
            </p>
          </div>
        ) : filteredJobCount === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center">
            <p className="text-sm font-medium text-gray-800">No jobs match this filter set</p>
            <p className="mt-1 text-sm text-gray-600">Try clearing search or switching back to the full job list.</p>
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Job</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Payment</th>
                  <th className="px-4 py-3 font-medium">Outstanding</th>
                  <th className="px-4 py-3 font-medium">Requests</th>
                  <th className="px-4 py-3 font-medium">Next due</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {jobs.map((job) => (
                  <tr key={job.id} className="align-top">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{job.name}</div>
                      <div className="mt-1 text-xs text-gray-500">
                        {job.reference ? `Ref ${job.reference} · ` : ""}
                        {job.customerId ? `Customer ${job.customerId}` : "No customer linked"}
                      </div>
                      {job.description ? <p className="mt-2 text-xs text-gray-600">{job.description}</p> : null}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {job.commencementBlocked ? "Blocked" : job.workStatus.replaceAll("_", " ")}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{job.paymentStatus.replaceAll("_", " ")}</td>
                    <td className="px-4 py-3 text-gray-700">{formatAudCents(job.outstandingAmountCents)}</td>
                    <td className="px-4 py-3 text-gray-700">{requestCountsByJobId[job.id] ?? 0}</td>
                    <td className="px-4 py-3 text-gray-700">{formatDate(nextRequestByJobId[job.id])}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={`/dashboard/deposit-guard/${job.id}`}
                          className="rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                        >
                          Open
                        </Link>
                        <Link
                          href="/dashboard/settings"
                          className="rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                        >
                          Settings
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}