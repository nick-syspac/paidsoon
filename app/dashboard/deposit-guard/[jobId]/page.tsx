import Link from "next/link"
import { redirect } from "next/navigation"

import { canAccessDepositGuard } from "@/lib/dashboard/depositGuardAccess"
import { getDepositGuardJobDetail } from "@/lib/depositGuard/jobDetail"
import { getSubscriptionTier } from "@/lib/billing"
import { getAuthenticatedUser } from "@/lib/supabase/server"

function formatAudCents(value: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(value / 100)
}

function formatDateTime(value: Date | null | undefined): string {
  if (!value) return "Not scheduled"

  return value.toLocaleString("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

function formatDate(value: Date | null | undefined): string {
  if (!value) return "Not scheduled"
  return value.toLocaleDateString("en-AU")
}

function titleCase(value: string): string {
  return value
    .replaceAll("_", " ")
    .split(" ")
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ")
}

function statusTone(value: string): string {
  if (["paid", "ready_to_start"].includes(value)) return "bg-emerald-50 text-emerald-800 ring-emerald-200"
  if (["overdue", "cancelled", "failed", "blocked"].includes(value)) return "bg-rose-50 text-rose-800 ring-rose-200"
  if (["requested", "viewed", "partially_paid", "awaiting_deposit"].includes(value)) {
    return "bg-amber-50 text-amber-800 ring-amber-200"
  }
  return "bg-gray-100 text-gray-700 ring-gray-200"
}

function kindTone(value: string): string {
  switch (value) {
    case "payment":
      return "bg-emerald-50 text-emerald-800"
    case "reminder":
      return "bg-amber-50 text-amber-800"
    case "request":
      return "bg-blue-50 text-blue-800"
    case "milestone":
      return "bg-violet-50 text-violet-800"
    case "job":
      return "bg-gray-100 text-gray-700"
    default:
      return "bg-slate-100 text-slate-700"
  }
}

export default async function DepositGuardJobPage({
  params,
}: {
  params: Promise<{ jobId: string }>
}) {
  const {
    data: { user },
  } = await getAuthenticatedUser()
  if (!user) redirect("/sign-in")

  const tier = await getSubscriptionTier(user.id)
  if (!canAccessDepositGuard(tier)) {
    redirect("/dashboard?intent=deposit_guard")
  }

  const { jobId } = await params
  const detail = await getDepositGuardJobDetail(user.id, jobId)
  if (!detail) redirect("/dashboard/deposit-guard")

  const { entitlements, job, requests, milestones, payments, reminders, timeline } = detail

  const jobRequests = requests
  const activeRequests = requests.filter((request) => request.status !== "cancelled" && request.status !== "expired")
  const completedPayments = payments.filter((payment) => payment.status === "confirmed")
  const pendingReminders = reminders.filter((reminder) => reminder.deliveryStatus === "pending")

  const commencementSummary = job.commencementBlocked
    ? "Work is blocked until the required deposit is paid in full."
    : job.workStatus === "ready_to_start"
      ? "The required deposit has cleared and work can begin."
      : "This job is currently progressing through its lifecycle."

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <Link href="/dashboard/deposit-guard" className="text-sm font-medium text-blue-700 hover:text-blue-800 hover:underline">
              Back to DepositGuard
            </Link>
            <h1 className="mt-2 text-xl font-semibold text-gray-900">{job.name}</h1>
            <p className="mt-1 text-sm text-gray-600">
              Track the lifecycle, reminders, payments, milestones, and commencement state for this job.
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium">
              <span className={`rounded-full px-3 py-1 ring-1 ${statusTone(job.workStatus)}`}>{titleCase(job.workStatus)}</span>
              <span className={`rounded-full px-3 py-1 ring-1 ${statusTone(job.paymentStatus)}`}>{titleCase(job.paymentStatus)}</span>
              <span className={`rounded-full px-3 py-1 ring-1 ${job.commencementBlocked ? "bg-rose-50 text-rose-800 ring-rose-200" : "bg-emerald-50 text-emerald-800 ring-emerald-200"}`}>
                {job.commencementBlocked ? "Commencement blocked" : "Commencement open"}
              </span>
            </div>
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
              href="/dashboard/deposit-guard"
              className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Jobs list
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Total deposit</p>
          <p className="mt-2 text-xl font-semibold text-gray-900">{formatAudCents(job.totalAmountCents)}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Outstanding</p>
          <p className="mt-2 text-xl font-semibold text-gray-900">{formatAudCents(job.outstandingAmountCents)}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Payment status</p>
          <p className="mt-2 text-xl font-semibold text-gray-900">{job.paymentStatus.replaceAll("_", " ")}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Requests</p>
          <p className="mt-2 text-xl font-semibold text-gray-900">{jobRequests.length}</p>
        </div>
      </section>

      <section className="rounded-xl border border-blue-200 bg-blue-50 p-5">
        <h2 className="text-base font-semibold text-blue-950">Commencement status</h2>
        <p className="mt-2 text-sm text-blue-900">{commencementSummary}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg bg-white/80 p-3 ring-1 ring-blue-100">
            <p className="text-xs uppercase tracking-wide text-blue-700">Required deposit</p>
            <p className="mt-1 text-sm font-semibold text-blue-950">{formatAudCents(job.requiredDepositAmountCents)}</p>
          </div>
          <div className="rounded-lg bg-white/80 p-3 ring-1 ring-blue-100">
            <p className="text-xs uppercase tracking-wide text-blue-700">Paid so far</p>
            <p className="mt-1 text-sm font-semibold text-blue-950">{formatAudCents(job.amountPaidCents)}</p>
          </div>
          <div className="rounded-lg bg-white/80 p-3 ring-1 ring-blue-100">
            <p className="text-xs uppercase tracking-wide text-blue-700">Ready state</p>
            <p className="mt-1 text-sm font-semibold text-blue-950">{job.commencementBlocked ? "Waiting on deposit" : titleCase(job.workStatus)}</p>
          </div>
        </div>
      </section>

      {!entitlements.canCreateRequests ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          This tier can review DepositGuard jobs, but request creation and live payment actions are still locked.
        </section>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.85fr)]">
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Timeline</h2>
              <p className="mt-1 text-sm text-gray-600">A chronological record of job, request, reminder, payment, and milestone events.</p>
            </div>
            <p className="text-xs text-gray-500">{timeline.length} events</p>
          </div>

          {timeline.length === 0 ? (
            <p className="mt-4 text-sm text-gray-600">No timeline events have been recorded for this job yet.</p>
          ) : (
            <ol className="mt-4 space-y-3">
              {timeline.map((entry) => (
                <li key={entry.id} className="rounded-lg border border-gray-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${kindTone(entry.kind)}`}>{titleCase(entry.kind)}</span>
                        <h3 className="text-sm font-semibold text-gray-900">{entry.title}</h3>
                      </div>
                      {entry.description ? <p className="mt-2 text-sm text-gray-700">{entry.description}</p> : null}
                    </div>
                    <p className="text-xs text-gray-500">{formatDateTime(entry.timestamp)}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        <div className="space-y-6">
          <section className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Requests</h2>
                <p className="mt-1 text-sm text-gray-600">Deposit and follow-up requests raised for this job.</p>
              </div>
              <p className="text-xs text-gray-500">{activeRequests.length} active</p>
            </div>

            {jobRequests.length === 0 ? (
              <p className="mt-4 text-sm text-gray-600">No requests have been created for this job yet.</p>
            ) : (
              <ul className="mt-4 space-y-3 text-sm text-gray-700">
                {jobRequests.map((request) => (
                  <li key={request.id} className="rounded-lg border border-gray-200 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-medium text-gray-900">{titleCase(request.requestType)}</p>
                        <p className="mt-1 text-xs text-gray-500">Due {formatDate(request.dueDate)}</p>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${statusTone(request.status)}`}>{titleCase(request.status)}</span>
                    </div>
                    <p className="mt-2 text-sm text-gray-700">{formatAudCents(request.totalAmountCents)}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Milestones</h2>
                <p className="mt-1 text-sm text-gray-600">Payment schedule milestones linked to this job.</p>
              </div>
              <p className="text-xs text-gray-500">{milestones.length} scheduled</p>
            </div>

            {milestones.length === 0 ? (
              <p className="mt-4 text-sm text-gray-600">No milestones have been defined for this job yet.</p>
            ) : (
              <ul className="mt-4 space-y-3 text-sm text-gray-700">
                {milestones.map((milestone) => (
                  <li key={milestone.id} className="rounded-lg border border-gray-200 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-medium text-gray-900">{milestone.sequence}. {milestone.name}</p>
                        {milestone.description ? <p className="mt-1 text-xs text-gray-500">{milestone.description}</p> : null}
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${statusTone(milestone.status)}`}>{titleCase(milestone.status)}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-600">
                      <span>{formatAudCents(milestone.calculatedAmountCents)}</span>
                      <span>·</span>
                      <span>{titleCase(milestone.amountType)}</span>
                      <span>·</span>
                      <span>{titleCase(milestone.triggerType)}</span>
                      {milestone.targetDate ? (
                        <>
                          <span>·</span>
                          <span>Target {formatDate(milestone.targetDate)}</span>
                        </>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Payments</h2>
                <p className="mt-1 text-sm text-gray-600">Recorded payments against this job or its requests.</p>
              </div>
              <p className="text-xs text-gray-500">{completedPayments.length} confirmed</p>
            </div>

            {payments.length === 0 ? (
              <p className="mt-4 text-sm text-gray-600">No payments have been recorded for this job yet.</p>
            ) : (
              <ul className="mt-4 space-y-3 text-sm text-gray-700">
                {payments.map((payment) => (
                  <li key={payment.id} className="rounded-lg border border-gray-200 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-medium text-gray-900">{formatAudCents(payment.amountCents)}</p>
                        <p className="mt-1 text-xs text-gray-500">{titleCase(payment.paymentMethod)} · {payment.paymentProvider ? titleCase(payment.paymentProvider) : "Manual"}</p>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${statusTone(payment.status)}`}>{titleCase(payment.status)}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-600">
                      <span>{payment.paidAt ? formatDateTime(payment.paidAt) : "No payment date"}</span>
                      {payment.notes ? (
                        <>
                          <span>·</span>
                          <span>{payment.notes}</span>
                        </>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Reminders</h2>
                <p className="mt-1 text-sm text-gray-600">Scheduled and delivered reminder attempts for linked requests.</p>
              </div>
              <p className="text-xs text-gray-500">{pendingReminders.length} pending</p>
            </div>

            {reminders.length === 0 ? (
              <p className="mt-4 text-sm text-gray-600">No reminders have been scheduled for this job yet.</p>
            ) : (
              <ul className="mt-4 space-y-3 text-sm text-gray-700">
                {reminders.map((reminder) => (
                  <li key={reminder.id} className="rounded-lg border border-gray-200 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-medium text-gray-900">{titleCase(reminder.reminderType)}</p>
                        <p className="mt-1 text-xs text-gray-500">Scheduled for {formatDateTime(reminder.scheduledFor)}</p>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${statusTone(reminder.deliveryStatus)}`}>{titleCase(reminder.deliveryStatus)}</span>
                    </div>
                    {reminder.failureReason ? <p className="mt-2 text-xs text-gray-600">{reminder.failureReason}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
