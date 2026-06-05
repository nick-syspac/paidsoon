import { prismaAdmin as prisma } from "@/lib/db/admin"
import { sendFollowUpEmail } from "@/lib/email/send"
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

  // 3. Find all invoices ready for their next email
  const now = new Date()
  const pendingInvoices = await prisma.trackedInvoice.findMany({
    where: {
      status: "pending",
      nextEmailAt: { lte: now },
      currentStage: { lt: 3 },
    },
    include: {
      userProfile: { select: { subscriptionTier: true, userId: true } },
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
    const freelancerName =
      userData?.user?.user_metadata?.full_name ??
      userData?.user?.email?.split("@")[0] ??
      "Your freelancer"

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
