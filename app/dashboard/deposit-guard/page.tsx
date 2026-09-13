import { redirect } from "next/navigation"

import { DepositGuardWorkspace } from "@/components/dashboard/depositGuard/DepositGuardWorkspace"
import { getSubscriptionTier } from "@/lib/billing"
import { canAccessDepositGuard } from "@/lib/dashboard/depositGuardAccess"
import { getDepositGuardEntitlements } from "@/lib/depositGuard/entitlements"
import { listDepositGuardJobs } from "@/lib/depositGuard/jobs"
import { listDepositRequests } from "@/lib/depositGuard/requests"
import { getAuthenticatedUser } from "@/lib/supabase/server"

function normalizeQueryValue(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase()
}

export default async function DepositGuardPage({
  searchParams,
}: {
  searchParams: Promise<{
    search?: string
    status?: string
    paymentStatus?: string
  }>
}) {
  const {
    data: { user },
  } = await getAuthenticatedUser()
  if (!user) redirect("/sign-in")

  const tier = await getSubscriptionTier(user.id)
  if (!canAccessDepositGuard(tier)) {
    redirect("/dashboard?intent=deposit_guard")
  }

  const params = await searchParams
  const search = normalizeQueryValue(params.search)
  const statusFilter = normalizeQueryValue(params.status)
  const paymentStatusFilter = normalizeQueryValue(params.paymentStatus)

  const entitlements = await getDepositGuardEntitlements(user.id)
  const [jobs, requests] = await Promise.all([
    listDepositGuardJobs(user.id),
    entitlements.canCreateRequests ? listDepositRequests(user.id) : Promise.resolve([]),
  ])

  const requestCountsByJobId = requests.reduce<Record<string, number>>((counts, request) => {
    counts[request.jobId] = (counts[request.jobId] ?? 0) + 1
    return counts
  }, {})
  const nextRequestByJobId = requests.reduce<Record<string, Date | null>>((nextByJobId, request) => {
    const current = nextByJobId[request.jobId]
    if (!current || request.dueDate < current) {
      nextByJobId[request.jobId] = request.dueDate
    }
    return nextByJobId
  }, {})
  const overdueRequestCount = requests.filter((request) => request.status === "overdue").length
  const blockedJobCount = jobs.filter((job) => job.commencementBlocked).length
  const activeJobCount = jobs.filter((job) => job.archivedAt === null).length
  const outstandingCents = jobs.reduce((sum, job) => sum + job.outstandingAmountCents, 0)

  const filteredJobs = jobs.filter((job) => {
    if (search) {
      const haystack = [job.name, job.description ?? "", job.reference ?? "", job.customerId ?? ""].join(" ").toLowerCase()
      if (!haystack.includes(search)) return false
    }
    if (statusFilter) {
      const blockedStatus = job.commencementBlocked ? "blocked" : "open"
      if (statusFilter !== job.workStatus.toLowerCase() && statusFilter !== blockedStatus) return false
    }
    if (paymentStatusFilter && paymentStatusFilter !== job.paymentStatus.toLowerCase()) return false
    return true
  })

  return DepositGuardWorkspace({
    activeJobCount,
    blockedJobCount,
    outstandingCents,
    overdueRequestCount,
    filteredJobCount: filteredJobs.length,
    totalJobCount: jobs.length,
    search,
    statusFilter,
    paymentStatusFilter,
    canCreateRequests: entitlements.canCreateRequests,
    jobs: filteredJobs.map((job) => ({
      id: job.id,
      name: job.name,
      description: job.description,
      reference: job.reference,
      customerId: job.customerId,
      workStatus: job.workStatus,
      paymentStatus: job.paymentStatus,
      commencementBlocked: job.commencementBlocked,
      outstandingAmountCents: job.outstandingAmountCents,
    })),
    requestCountsByJobId,
    nextRequestByJobId,
  })
}
