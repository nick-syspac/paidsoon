import { prismaAdmin as prisma } from "@/lib/db/admin"
import { sendP2PNotification, resolveFreelancerName } from "@/lib/email/send"
import { createClient } from "@supabase/supabase-js"
import { getPublicSupabaseEnvironment } from "@/lib/config/supabaseEnvironmentRuntime"

/**
 * Detects broken promises (active promises whose date has passed) and
 * arrangement breaches/expiry, updating lifecycle status and notifying
 * freelancers where relevant.
 *
 * Extracted from `app/api/cron/send-emails/route.ts` (steps 3-4) so it has a
 * single implementation shared by the Vercel Cron job and the Railway Celery
 * `promise_followup`/`arrangement_lifecycle` sweep tasks during the parallel
 * migration period — behavior is unchanged, only the call site moved.
 */
export async function runPromiseAndArrangementBreachSweep() {
  const brokenPromises = await prisma.promiseToPay.findMany({
    where: {
      status: "active",
      promisedPayBy: { lt: new Date() },
      trackedInvoice: {
        status: { notIn: ["paid", "manually_resolved"] },
      },
    },
    include: {
      trackedInvoice: {
        include: {
          userProfile: { select: { userId: true, displayName: true } },
        },
      },
    },
  })

  if (brokenPromises.length > 0) {
    const supabaseAdminBreach = createClient(
      getPublicSupabaseEnvironment().publicUrl,
      process.env.SUPABASE_SECRET_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    for (const bp of brokenPromises) {
      await prisma.promiseToPay.update({
        where: { id: bp.id },
        data: { status: "broken", breachNotifiedAt: new Date() },
      })

      const brokenCount = await prisma.promiseToPay.count({
        where: {
          status: "broken",
          trackedInvoice: { clientEmail: bp.trackedInvoice.clientEmail },
        },
      })

      try {
        const { data: ud } = await supabaseAdminBreach.auth.admin.getUserById(
          bp.trackedInvoice.userId,
        )
        const freelancerEmail = ud?.user?.email ?? ""
        const freelancerName = resolveFreelancerName(
          bp.trackedInvoice.userProfile.displayName,
          ud?.user?.user_metadata?.full_name,
          ud?.user?.email,
        )
        await sendP2PNotification(
          "promise_broken",
          bp.trackedInvoice,
          bp,
          freelancerEmail,
          freelancerName,
          brokenCount,
        )
      } catch (err) {
        console.error(`Breach notification failed for promise ${bp.id}:`, err)
      }
    }
  }

  const activeArrangements = await prisma.arrangement.findMany({
    where: {
      status: "active",
      OR: [
        { promisedPayBy: { lt: new Date() } },
        { promisedPayBy: null, expiresAt: { lt: new Date() } },
      ],
    },
    select: { id: true, promisedPayBy: true },
  })

  for (const arrangement of activeArrangements) {
    await prisma.arrangement.update({
      where: { id: arrangement.id },
      data:
        arrangement.promisedPayBy != null
          ? { status: "broken", breachedAt: new Date() }
          : { status: "expired" },
    })
  }

  return {
    brokenPromises: brokenPromises.length,
    arrangementsUpdated: activeArrangements.length,
  }
}

/**
 * Runs the catch-up/snooze-resume half of the sweep (steps 1-2 of the
 * original cron): detects new overdue invoices and resumes snoozed ones.
 */
export async function runCatchupAndSnoozeSweep() {
  const { runCatchUpScan } = await import("@/lib/email/catchup")
  await runCatchUpScan()

  const resumed = await prisma.trackedInvoice.updateMany({
    where: {
      status: "snoozed",
      snoozedUntil: { lte: new Date() },
    },
    data: { status: "pending", snoozedUntil: null },
  })

  return { snoozedResumed: resumed.count }
}
