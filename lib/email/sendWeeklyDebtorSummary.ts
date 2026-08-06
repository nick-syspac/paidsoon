import { Resend } from "resend"
import { prismaAdmin as prisma } from "@/lib/db/admin"
import { getWeeklyDebtorSummaryWeekStart, buildWeeklyDebtorSummaryEmail, buildWeeklyDebtorSummaryPayload } from "@/lib/email/weeklyDebtorSummary"
import { hasPlanFeature } from "@/lib/subscriptionPlans"
import { createClient } from "@supabase/supabase-js"

let _resend: Resend | undefined
function getResend(): Resend {
  return _resend ?? (_resend = new Resend(process.env.RESEND_API_KEY!))
}

type SummarySendOutcome =
  | { status: "sent"; messageId: string | null }
  | { status: "already_sent"; messageId: string | null }
  | { status: "skipped"; reason: string }

function isEligibleTier(tier: string | null | undefined): boolean {
  return hasPlanFeature(tier, "weekly_summary_email")
}

export async function sendWeeklyDebtorSummary(userId: string): Promise<SummarySendOutcome> {
  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    select: { displayName: true, subscriptionTier: true },
  })

  if (!isEligibleTier(profile?.subscriptionTier)) {
    return { status: "skipped", reason: "weekly_summary_not_available" }
  }

  const weekStart = getWeeklyDebtorSummaryWeekStart()
  const existing = await prisma.weeklyDebtorSummaryDelivery.findUnique({
    where: { userId_weekStart: { userId, weekStart } },
  })

  if (existing?.status === "sent") {
    return { status: "already_sent", messageId: existing.resendMessageId ?? null }
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
  const { data: userData } = await supabaseAdmin.auth.admin.getUserById(userId)
  const recipientEmail = userData?.user?.email
  if (!recipientEmail) {
    return { status: "skipped", reason: "missing_recipient_email" }
  }

  const invoices = await prisma.trackedInvoice.findMany({
    where: {
      userId,
      status: { in: ["pending", "paused", "snoozed", "sequence_complete"] },
    },
    select: {
      clientEmail: true,
      clientName: true,
      amountDue: true,
      currency: true,
      dueDate: true,
      status: true,
    },
  })

  const payload = buildWeeklyDebtorSummaryPayload(invoices, new Date())
  const content = buildWeeklyDebtorSummaryEmail({
    tenantName: profile?.displayName ?? userData?.user?.user_metadata?.full_name ?? recipientEmail,
    payload,
  })

  await prisma.weeklyDebtorSummaryDelivery.upsert({
    where: { userId_weekStart: { userId, weekStart } },
    create: {
      userId,
      weekStart,
      status: "sending",
      subject: content.subject,
    },
    update: {
      status: "sending",
      subject: content.subject,
      lastError: null,
    },
  })

  try {
    const result = await getResend().emails.send({
      from: `${process.env.RESEND_FROM_NAME!} <${process.env.RESEND_FROM_EMAIL!}>`,
      to: recipientEmail,
      subject: content.subject,
      html: content.html,
      text: content.text,
    })

    const messageId = result.data?.id ?? null
    await prisma.weeklyDebtorSummaryDelivery.update({
      where: { userId_weekStart: { userId, weekStart } },
      data: {
        status: "sent",
        resendMessageId: messageId,
        sentAt: new Date(),
      },
    })
    return { status: "sent", messageId }
  } catch (error) {
    await prisma.weeklyDebtorSummaryDelivery.update({
      where: { userId_weekStart: { userId, weekStart } },
      data: { status: "failed", lastError: error instanceof Error ? error.message : "send_failed" },
    })
    throw error
  }
}