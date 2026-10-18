import { Resend } from "resend"
import { prismaAdmin as prisma } from "@/lib/db/admin"
import { getWeeklyDebtorSummaryWeekStart, buildWeeklyDebtorSummaryEmail, buildWeeklyDebtorSummaryPayload } from "@/lib/email/weeklyDebtorSummary"
import { getSummaryAccessSkip, type SummaryAccessSkip } from "@/lib/email/summaryAccess"
import { createClient } from "@supabase/supabase-js"
import { getPublicSupabaseEnvironment } from "@/lib/config/supabaseEnvironmentRuntime"

let _resend: Resend | undefined
function getResend(): Resend {
  return _resend ?? (_resend = new Resend(process.env.RESEND_API_KEY!))
}

export type SummarySendOutcome =
  | { status: "sent"; messageId: string | null }
  | { status: "already_sent"; messageId: string | null }
  | SummaryAccessSkip
  | { status: "skipped"; reason: "missing_recipient_email" }

export async function sendWeeklyDebtorSummary(userId: string): Promise<SummarySendOutcome> {
  // Intentional tenant-scoped privileged reads/writes for authenticated system jobs.
  const accessSkip = await getSummaryAccessSkip(userId, "weekly_summary_email")
  if (accessSkip) return accessSkip
  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    select: { displayName: true },
  })

  const weekStart = getWeeklyDebtorSummaryWeekStart()
  const existing = await prisma.weeklyDebtorSummaryDelivery.findUnique({
    where: { userId_weekStart: { userId, weekStart } },
  })

  if (existing?.status === "sent") {
    return { status: "already_sent", messageId: existing.resendMessageId ?? null }
  }

  const supabaseAdmin = createClient(
    getPublicSupabaseEnvironment().publicUrl,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
  const { data: userData } = await supabaseAdmin.auth.admin.getUserById(userId)
  const recipientEmail = userData?.user?.email
  if (!recipientEmail) {
    return { status: "skipped", reason: "missing_recipient_email" }
  }

  const invoiceRows = await prisma.trackedInvoice.findMany({
    where: {
      userId,
      status: { in: ["pending", "paused", "snoozed", "sequence_complete"] },
    },
    select: {
      status: true,
      financialInvoice: {
        select: {
          amountDueCents: true,
          currency: true,
          dueDate: true,
          contact: { select: { name: true, email: true } },
        },
      },
      payments: { select: { amount: true } },
    },
  })

  // Recipient/invoice loading can outlive the access that authorized this job.
  const computeSkip = await getSummaryAccessSkip(userId, "weekly_summary_email")
  if (computeSkip) return computeSkip

  const invoices = invoiceRows.map((row) => ({
    status: row.status,
    clientEmail: row.financialInvoice.contact?.email ?? "",
    clientName: row.financialInvoice.contact?.name ?? "",
    amountDue: row.financialInvoice.amountDueCents,
    currency: row.financialInvoice.currency,
    dueDate: row.financialInvoice.dueDate,
    payments: row.payments,
  }))

  const payload = buildWeeklyDebtorSummaryPayload(invoices, new Date())
  const content = buildWeeklyDebtorSummaryEmail({
    tenantName: profile?.displayName ?? userData?.user?.user_metadata?.full_name ?? recipientEmail,
    payload,
  })

  const preparedSkip = await getSummaryAccessSkip(userId, "weekly_summary_email")
  if (preparedSkip) return preparedSkip

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
    const sendSkip = await getSummaryAccessSkip(userId, "weekly_summary_email")
    if (sendSkip) {
      // A reservation is not a send or weekly consumption; it remains retryable.
      await prisma.weeklyDebtorSummaryDelivery.update({
        where: { userId_weekStart: { userId, weekStart } },
        data: { status: "skipped", lastError: sendSkip.reason },
      })
      return sendSkip
    }
    const result = await getResend().emails.send({
      from: `${process.env.RESEND_FROM_NAME!} <${process.env.RESEND_FROM_EMAIL!}>`,
      to: recipientEmail,
      subject: content.subject,
      html: content.html,
      text: content.text,
    })
    if (result.error) throw new Error("weekly_summary_send_failed")

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