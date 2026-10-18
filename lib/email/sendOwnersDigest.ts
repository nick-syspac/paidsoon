import { Resend } from "resend"

import { prismaAdmin as prisma } from "@/lib/db/admin"
import { buildOwnersDigestEmail } from "@/lib/email/ownersDigest"
import { fetchOwnersDigestRecipientEmail } from "@/lib/ownersDigest/recipient"
import { generateOwnersDigest } from "@/lib/ownersDigest/service"
import { OwnersDigestAccessError } from "@/lib/ownersDigest/entitlements"
import { getSummaryAccessSkip, type SummaryAccessSkip } from "@/lib/email/summaryAccess"

let _resend: Resend | undefined
function getResend(): Resend {
  return _resend ?? (_resend = new Resend(process.env.RESEND_API_KEY!))
}

export type OwnersDigestSendOutcome =
  | { status: "sent"; messageId: string | null }
  | { status: "already_sent"; messageId: string | null }
  | SummaryAccessSkip
  | { status: "skipped"; reason: "owners_digest_email_disabled" | "owners_digest_not_due" | "owners_digest_empty" | "missing_recipient_email" }

function normalizeWeekday(value: string): number {
  const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
  const index = weekdays.indexOf(value.toLowerCase())
  return index === -1 ? 1 : index
}

function isDigestDue(input: {
  now: Date
  frequency: string
  deliveryDay: string
  deliveryTime: string
}): boolean {
  if (input.frequency === "off") return false
  const hour = Number(input.deliveryTime.split(":")[0] ?? "7")
  if (input.now.getUTCHours() !== hour) return false

  if (input.frequency === "daily") return true
  if (input.frequency === "weekly") return input.now.getUTCDay() === normalizeWeekday(input.deliveryDay)
  if (input.frequency === "monthly") return input.now.getUTCDate() === 1
  return false
}

export async function sendOwnersDigest(userId: string, now: Date = new Date()): Promise<OwnersDigestSendOutcome> {
  // Intentional tenant-scoped privileged reads/writes for authenticated system jobs.
  // `now` controls cadence only: execution authorization always uses fresh time.
  const accessSkip = await getSummaryAccessSkip(userId, "owners_digest_email")
  if (accessSkip) return accessSkip
  const [profile, settings] = await Promise.all([
    prisma.userProfile.findUnique({
      where: { userId },
      select: { displayName: true },
    }),
    prisma.ownersDigestSetting.findUnique({ where: { userId } }),
  ])

  if (!settings?.enabled || !settings.emailEnabled) {
    return { status: "skipped", reason: "owners_digest_email_disabled" }
  }

  if (!isDigestDue({
    now,
    frequency: settings.frequency,
    deliveryDay: settings.deliveryDay,
    deliveryTime: settings.deliveryTime,
  })) {
    return { status: "skipped", reason: "owners_digest_not_due" }
  }

  let digest: Awaited<ReturnType<typeof generateOwnersDigest>>
  try {
    digest = await generateOwnersDigest(userId, { now, source: "scheduled" })
  } catch (error) {
    if (!(error instanceof OwnersDigestAccessError)) throw error
    return (await getSummaryAccessSkip(userId, "owners_digest_email")) ??
      { status: "skipped", reason: "owners_digest_email_not_available" }
  }
  console.info(
    JSON.stringify({
      event: "owners_digest_email_requested",
      userId,
      digestId: digest.id,
      frequency: digest.frequency,
      itemCount: digest.items.length,
    }),
  )
  if (digest.items.length === 0 && !settings.sendWhenEmpty) {
    return { status: "skipped", reason: "owners_digest_empty" }
  }

  const deliveryKey = `${digest.frequency}:${digest.periodStart.toISOString()}:${settings.recipientScope}`
  const existing = await prisma.ownersDigestDelivery.findUnique({
    where: { userId_deliveryKey: { userId, deliveryKey } },
  })
  if (existing?.status === "sent") {
    return { status: "already_sent", messageId: existing.messageId ?? null }
  }

  const recipientEmail = await fetchOwnersDigestRecipientEmail(userId)
  if (!recipientEmail) {
    return { status: "skipped", reason: "missing_recipient_email" }
  }

  const content = buildOwnersDigestEmail({
    tenantName: profile?.displayName ?? recipientEmail,
    digest,
  })

  const preparedSkip = await getSummaryAccessSkip(userId, "owners_digest_email")
  if (preparedSkip) return preparedSkip

  await prisma.ownersDigestDelivery.upsert({
    where: { userId_deliveryKey: { userId, deliveryKey } },
    create: {
      userId,
      snapshotId: digest.id,
      deliveryScope: settings.recipientScope,
      channel: "email",
      status: "pending",
      recipientCount: 1,
      deliveryKey,
      requestedAt: now,
    },
    update: {
      snapshotId: digest.id,
      deliveryScope: settings.recipientScope,
      status: "pending",
      recipientCount: 1,
      requestedAt: now,
      errorCode: null,
      errorSummary: null,
    },
  })

  try {
    const sendSkip = await getSummaryAccessSkip(userId, "owners_digest_email")
    if (sendSkip) {
      await prisma.ownersDigestDelivery.update({
        where: { userId_deliveryKey: { userId, deliveryKey } },
        data: { status: "skipped", errorCode: sendSkip.reason },
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
    if (result.error) throw new Error("owners_digest_send_failed")

    const messageId = result.data?.id ?? null
    await prisma.ownersDigestDelivery.update({
      where: { userId_deliveryKey: { userId, deliveryKey } },
      data: {
        status: "sent",
        messageId,
        sentAt: new Date(),
      },
    })
    console.info(
      JSON.stringify({
        event: "owners_digest_email_delivered",
        userId,
        digestId: digest.id,
        messageId,
      }),
    )
    return { status: "sent", messageId }
  } catch (error) {
    await prisma.ownersDigestDelivery.update({
      where: { userId_deliveryKey: { userId, deliveryKey } },
      data: {
        status: "failed",
        failedAt: new Date(),
        errorCode: "send_failed",
        errorSummary: error instanceof Error ? error.message : "send_failed",
      },
    })
    console.error(
      JSON.stringify({
        event: "owners_digest_email_failed",
        userId,
        digestId: digest.id,
        error: error instanceof Error ? error.message : "send_failed",
      }),
    )
    throw error
  }
}
