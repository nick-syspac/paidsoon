import { prismaAdmin as prisma } from "@/lib/db/admin"
import { sendFollowUpEmail, sendP2PNotification, resolveFreelancerName } from "@/lib/email/send"
import { computeNextEmailAt } from "@/lib/email/schedule"
import { runCatchUpScan } from "@/lib/email/catchup"
import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

// Secure with CRON_SECRET (Vercel sets this automatically for Vercel Cron)
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // 1. Run catch-up scan to detect new overdue invoices
  await runCatchUpScan()

  // 2. Resume any snoozed invoices where snoozedUntil has passed
  await prisma.trackedInvoice.updateMany({
    where: {
      status: "snoozed",
      snoozedUntil: { lte: new Date() },
    },
    data: { status: "pending", snoozedUntil: null },
  })

  // 3. Detect broken promises: active promises whose date has passed and the
  //    invoice is not yet paid or resolved. Mark broken and notify freelancer.
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
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    for (const bp of brokenPromises) {
      await prisma.promiseToPay.update({
        where: { id: bp.id },
        data: { status: "broken", breachNotifiedAt: new Date() },
      })

      // Count total broken promises for this client email (for the notification)
      const brokenCount = await prisma.promiseToPay.count({
        where: {
          status: "broken",
          trackedInvoice: { clientEmail: bp.trackedInvoice.clientEmail },
        },
      })

      try {
        const { data: ud } = await supabaseAdminBreach.auth.admin.getUserById(
          bp.trackedInvoice.userId
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

  // 4. Detect arrangement breaches/expiry and update lifecycle status.
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
    },
  })

  // Use Supabase admin client to get user emails (needed for freelancerName/email)
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  let emailsSent = 0
  let errors = 0

  for (const invoice of pendingInvoices) {
    const stage = (invoice.currentStage + 1) as 1 | 2 | 3

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

    // Get user schedule for computing next send date
    const schedule = await prisma.schedule.findUnique({
      where: { userId: invoice.userId },
    })

    if (stage === 3) {
      // Sequence complete
      await prisma.trackedInvoice.update({
        where: { id: invoice.id },
        data: { currentStage: 3, status: "sequence_complete", nextEmailAt: null },
      })
    } else {
      const nextStage = (stage + 1) as 2 | 3
      const nextEmailAt = computeNextEmailAt(
        invoice.dueDate,
        nextStage,
        schedule ?? { email1DaysAfterDue: 3, email2DaysAfterDue: 10, email3DaysAfterDue: 21 }
      )
      await prisma.trackedInvoice.update({
        where: { id: invoice.id },
        data: { currentStage: stage, nextEmailAt },
      })
    }
  }

  return NextResponse.json({
    ok: true,
    emailsSent,
    errors,
    processed: pendingInvoices.length,
  })
}
