import { prismaAdmin as prisma } from "@/lib/db/admin"
import { sendFollowUpEmail, resolveFreelancerName } from "@/lib/email/send"
import { computeNextEmailAt, resolveScheduleConfig, shouldAutoChaseCustomer } from "@/lib/email/schedule"
import { getChaseAllowanceStatusesForUsers } from "@/lib/billing"
import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { runCatchupAndSnoozeSweep, runPromiseAndArrangementBreachSweep } from "@/lib/email/breachSweep"
import {
  applyTimingEscalation,
  applyToneEscalationStage,
  buildBrokenPromiseDebtorCounts,
  promiseDebtorKey,
  resolvePromiseEscalationPolicy,
} from "@/lib/promiseEscalationPolicy"
import { getPublicSupabaseEnvironment } from "@/lib/config/supabaseEnvironmentRuntime"

// Secure with CRON_SECRET (Vercel sets this automatically for Vercel Cron)
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // 1-2. Catch-up scan for new overdue invoices + resume snoozed invoices
  // (shared with the Railway Celery catchup_and_snooze sweep task).
  await runCatchupAndSnoozeSweep()

  // 3-4. Detect broken promises + arrangement breaches/expiry (shared with
  // the Railway Celery promise_followup/arrangement_lifecycle sweep tasks).
  await runPromiseAndArrangementBreachSweep()

  // 5. Find invoices with active promises or active arrangements — these must
  //    not receive emails this cycle.
  const activePromiseInvoiceIds = (
    await prisma.promiseToPay.findMany({
      where: { status: "active" },
      select: { trackedInvoiceId: true },
    })
  ).map((p) => p.trackedInvoiceId)

  const activeArrangementInvoiceIds = (
    await prisma.arrangementInvoiceCoverage.findMany({
      where: { arrangement: { status: "active" } },
      select: { trackedInvoiceId: true },
    })
  ).map((coverage) => coverage.trackedInvoiceId)

  const suppressedInvoiceIds = Array.from(
    new Set([...activePromiseInvoiceIds, ...activeArrangementInvoiceIds])
  )

  // 6. Find all invoices ready for their next email (excluding those suppressed)
  const now = new Date()
  const pendingInvoices = await prisma.trackedInvoice.findMany({
    where: {
      status: "pending",
      nextEmailAt: { lte: now },
      currentStage: { lt: 3 },
      ...(suppressedInvoiceIds.length > 0
        ? { id: { notIn: suppressedInvoiceIds } }
        : {}),
    },
    include: {
      userProfile: { select: { subscriptionTier: true, userId: true, displayName: true } },
      customer: { select: { neverAutoChase: true, unsubscribed: true, cadenceOverride: true } },
      financialInvoice: { include: { contact: true } },
    },
  })

  // Customers who opted out of auto-chasing or unsubscribed entirely are
  // excluded here rather than in the query above, mirroring the
  // pure-function-over-loaded-array convention used throughout lib/dashboard.
  const invoicesToProcess = pendingInvoices.filter((invoice) => shouldAutoChaseCustomer(invoice.customer))

  // Use Supabase admin client to get user emails (needed for freelancerName/email)
  const { publicUrl } = getPublicSupabaseEnvironment()
  const supabaseAdmin = createClient(
    publicUrl,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  let emailsSent = 0
  let errors = 0
  let held = 0

  const userIds = Array.from(new Set(invoicesToProcess.map((invoice) => invoice.userId)))
  const [brokenPromiseRows, policyRows, allowanceStatuses] = await Promise.all([
    prisma.promiseToPay.findMany({
      where: {
        status: "broken",
        userId: { in: userIds },
      },
      select: {
        userId: true,
        trackedInvoice: {
          select: { financialInvoice: { select: { contact: { select: { email: true } } } } },
        },
      },
    }),
    prisma.promiseEscalationPolicy.findMany({
      where: { userId: { in: userIds } },
      select: {
        userId: true,
        retryLimit: true,
        escalationThreshold: true,
        timingEscalationEnabled: true,
        toneEscalationEnabled: true,
      },
    }),
    // Computed once per account per pass (not per invoice) — task 3.1.
    getChaseAllowanceStatusesForUsers(prisma, userIds),
  ])

  const brokenCountsByUserAndDebtor = buildBrokenPromiseDebtorCounts(
    brokenPromiseRows.map((row) => ({
      userId: row.userId,
      clientEmail: row.trackedInvoice.financialInvoice.contact?.email ?? "",
    }))
  )

  const policyByUserId = new Map(
    policyRows.map((row) => [row.userId, resolvePromiseEscalationPolicy(row)])
  )

  for (const invoice of invoicesToProcess) {
    const isFirstChase = invoice.currentStage === 0

    // Allowance gate: only the first reminder for an invoice consumes
    // allowance. An account with no remaining allowance holds new first
    // chases — the invoice's state is left untouched so it is retried on a
    // later pass, once the period rolls over. Sequences already in progress
    // (currentStage > 0) are never gated.
    if (isFirstChase) {
      const allowanceStatus = allowanceStatuses.get(invoice.userId)
      if (allowanceStatus && allowanceStatus.remaining <= 0) {
        held++
        continue
      }
    }

    const baseStage = (invoice.currentStage + 1) as 1 | 2 | 3
    const policy = resolvePromiseEscalationPolicy(policyByUserId.get(invoice.userId))
    const brokenCount =
      brokenCountsByUserAndDebtor.get(
        promiseDebtorKey(invoice.userId, invoice.financialInvoice.contact?.email ?? "")
      ) ?? 0
    const stage = applyToneEscalationStage(baseStage, brokenCount, policy)

    // Get freelancer's name and email from Supabase auth
    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(invoice.userId)
    const freelancerEmail = userData?.user?.email ?? ""
    const freelancerName = resolveFreelancerName(
      invoice.userProfile.displayName,
      userData?.user?.user_metadata?.full_name,
      userData?.user?.email,
    )

    const messageId = await sendFollowUpEmail(invoice, stage, freelancerEmail, freelancerName)

    if (messageId === null) {
      errors++
      continue
    }

    emailsSent++

    // A single cron pass cannot exceed the allowance: decrement the in-pass
    // figure immediately after the send that consumed it, before the next
    // invoice for this account is considered (task 3.5).
    if (isFirstChase) {
      const allowanceStatus = allowanceStatuses.get(invoice.userId)
      if (allowanceStatus) {
        allowanceStatus.usage += 1
        allowanceStatus.remaining = Math.max(allowanceStatus.allowance - allowanceStatus.usage, 0)
        allowanceStatus.atCapacity = allowanceStatus.usage >= allowanceStatus.allowance
      }
    }

    // Get user schedule for computing next send date
    const schedule = await prisma.schedule.findUnique({
      where: { userId: invoice.userId },
    })

    if (stage === 3) {
      // Sequence complete
      await prisma.trackedInvoice.update({
        where: { id: invoice.id },
        data: {
          currentStage: 3,
          status: "sequence_complete",
          nextEmailAt: null,
          ...(isFirstChase ? { firstChasedAt: new Date() } : {}),
        },
      })
    } else {
      const nextStage = (stage + 1) as 2 | 3
      const effectiveSchedule = resolveScheduleConfig(
        schedule ?? { email1DaysAfterDue: 3, email2DaysAfterDue: 10, email3DaysAfterDue: 21 },
        invoice.customer?.cadenceOverride,
      )
      let nextEmailAt = computeNextEmailAt(invoice.financialInvoice.dueDate, nextStage, effectiveSchedule)
      nextEmailAt = applyTimingEscalation(nextEmailAt, brokenCount, policy)
      await prisma.trackedInvoice.update({
        where: { id: invoice.id },
        data: {
          currentStage: stage,
          nextEmailAt,
          ...(isFirstChase ? { firstChasedAt: new Date() } : {}),
        },
      })
    }
  }

  return NextResponse.json({
    ok: true,
    emailsSent,
    errors,
    processed: invoicesToProcess.length,
    held,
    usageByAccount: Array.from(allowanceStatuses.entries()).map(([userId, status]) => ({
      userId,
      allowance: status.allowance,
      usage: status.usage,
      remaining: status.remaining,
      atCapacity: status.atCapacity,
    })),
  })
}
