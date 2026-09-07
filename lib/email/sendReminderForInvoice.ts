import { withUserContext } from "@/lib/db/withUserContext"
import { createClient } from "@supabase/supabase-js"
import { sendFollowUpEmail, resolveFreelancerName } from "@/lib/email/send"
import { computeNextEmailAt } from "@/lib/email/schedule"
import { getChaseAllowanceStatus } from "@/lib/billing"
import {
  applyTimingEscalation,
  applyToneEscalationStage,
  resolvePromiseEscalationPolicy,
} from "@/lib/promiseEscalationPolicy"
import { getPublicSupabaseEnvironment } from "@/lib/config/supabaseEnvironmentRuntime"

export type ReminderOutcome =
  | { outcome: "sent"; stage: 1 | 2 | 3 }
  | { outcome: "skipped"; reason: string }
  | { outcome: "held"; reason: "allowance_exhausted" }
  | { outcome: "error"; reason: string }

/**
 * Sends the next reminder stage for a single tracked invoice.
 *
 * This is the per-invoice entry point used by the Railway Celery reminder
 * task (invoked via the internal `/api/internal/jobs/send-reminder` route),
 * as opposed to `app/api/cron/send-emails/route.ts`'s whole-account batch
 * pass. Because Celery workers are separate processes (unlike the single
 * Vercel Cron invocation the batch pass assumes), the chase-volume allowance
 * check-and-consume step is made atomic per account with a Postgres advisory
 * lock rather than the batch pass's in-memory decrement.
 */
export async function sendReminderForInvoice(
  userId: string,
  trackedInvoiceId: string,
): Promise<ReminderOutcome> {
  return withUserContext(userId, async (tx) => {
    // Advisory lock scoped to this account — serializes concurrent Celery
    // workers processing invoices for the same user so the allowance check
    // below can't be raced past its limit.
    await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext($1))`, userId)

    const invoice = await tx.trackedInvoice.findUnique({
      where: { id: trackedInvoiceId },
      include: {
        userProfile: { select: { subscriptionTier: true, userId: true, displayName: true } },
        financialInvoice: { include: { contact: true } },
      },
    })
    if (!invoice) return { outcome: "skipped", reason: "invoice_not_found" }

    const now = new Date()
    if (
      invoice.status !== "pending" ||
      invoice.currentStage >= 3 ||
      !invoice.nextEmailAt ||
      invoice.nextEmailAt > now
    ) {
      return { outcome: "skipped", reason: "not_eligible" }
    }

    // Sequential (not Promise.all) — concurrent queries on the same `tx` inside
    // an interactive transaction share one pg connection and are unsafe.
    const activePromise = await tx.promiseToPay.findFirst({
      where: { trackedInvoiceId: invoice.id, status: "active" },
      select: { id: true },
    })
    const activeArrangementCoverage = await tx.arrangementInvoiceCoverage.findFirst({
      where: { trackedInvoiceId: invoice.id, arrangement: { status: "active" } },
      select: { id: true },
    })
    if (activePromise || activeArrangementCoverage) {
      return { outcome: "skipped", reason: "suppressed_by_active_promise_or_arrangement" }
    }

    const isFirstChase = invoice.currentStage === 0
    if (isFirstChase) {
      const allowanceStatus = await getChaseAllowanceStatus(tx, userId, now)
      if (allowanceStatus && allowanceStatus.remaining <= 0) {
        return { outcome: "held", reason: "allowance_exhausted" }
      }
    }

    const brokenCount = await tx.promiseToPay.count({
      where: {
        userId,
        status: "broken",
        trackedInvoice: {
          financialInvoice: {
            contact: { emailLower: invoice.financialInvoice.contact?.emailLower ?? "" },
          },
        },
      },
    })
    const policyRow = await tx.promiseEscalationPolicy.findUnique({ where: { userId } })
    const policy = resolvePromiseEscalationPolicy(policyRow ?? undefined)
    const baseStage = (invoice.currentStage + 1) as 1 | 2 | 3
    const stage = applyToneEscalationStage(baseStage, brokenCount, policy)

    const freelancerEmail = await resolveFreelancerEmail(userId, invoice.userProfile.displayName)

    const messageId = await sendFollowUpEmail(
      invoice,
      stage,
      freelancerEmail.email,
      freelancerEmail.name,
    )
    if (messageId === null) {
      return { outcome: "error", reason: "send_failed" }
    }

    const schedule = await tx.schedule.findUnique({ where: { userId } })
    if (stage === 3) {
      await tx.trackedInvoice.update({
        where: { id: invoice.id },
        data: {
          currentStage: 3,
          status: "sequence_complete",
          nextEmailAt: null,
          ...(isFirstChase ? { firstChasedAt: now } : {}),
        },
      })
    } else {
      const nextStage = (stage + 1) as 2 | 3
      let nextEmailAt = computeNextEmailAt(
        invoice.financialInvoice.dueDate,
        nextStage,
        schedule ?? { email1DaysAfterDue: 3, email2DaysAfterDue: 10, email3DaysAfterDue: 21 },
      )
      nextEmailAt = applyTimingEscalation(nextEmailAt, brokenCount, policy)
      await tx.trackedInvoice.update({
        where: { id: invoice.id },
        data: {
          currentStage: stage,
          nextEmailAt,
          ...(isFirstChase ? { firstChasedAt: now } : {}),
        },
      })
    }

    return { outcome: "sent", stage }
  })
}

async function resolveFreelancerEmail(
  userId: string,
  displayName: string | null,
): Promise<{ email: string; name: string }> {
  const supabaseAdmin = createClient(
    getPublicSupabaseEnvironment().publicUrl,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
  const { data: userData } = await supabaseAdmin.auth.admin.getUserById(userId)
  return {
    email: userData?.user?.email ?? "",
    name: resolveFreelancerName(displayName, userData?.user?.user_metadata?.full_name, userData?.user?.email),
  }
}
