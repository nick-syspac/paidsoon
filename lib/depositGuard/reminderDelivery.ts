import { prismaAdmin } from "@/lib/db/admin"
import { sendDepositReminderEmail } from "@/lib/email/sendDepositReminder"

export type DepositReminderDispatchOutcome =
  | { status: "sent"; messageId: string | null }
  | { status: "already_sent" }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string }

function isTerminalRequestStatus(status: string): boolean {
  return status === "paid" || status === "cancelled" || status === "expired" || status === "failed"
}

export async function processDepositReminder(reminderId: string): Promise<DepositReminderDispatchOutcome> {
  const reminder = await prismaAdmin.depositReminder.findUnique({
    where: { id: reminderId },
    include: {
      depositRequest: {
        include: {
          job: {
            include: {
              userProfile: { select: { displayName: true } },
              customer: {
                include: {
                  financialContact: { select: { name: true, email: true } },
                },
              },
            },
          },
        },
      },
    },
  })

  if (!reminder) {
    return { status: "skipped", reason: "reminder_not_found" }
  }

  if (reminder.deliveryStatus === "sent") {
    return { status: "already_sent" }
  }

  const request = reminder.depositRequest
  const now = new Date()
  if (request.status === "paid") {
    await prismaAdmin.depositReminder.update({
      where: { id: reminder.id },
      data: {
        deliveryStatus: "cancelled",
        failureReason: "request_paid",
      },
    })
    return { status: "skipped", reason: "request_paid" }
  }
  if (isTerminalRequestStatus(request.status)) {
    await prismaAdmin.depositReminder.update({
      where: { id: reminder.id },
      data: {
        deliveryStatus: "cancelled",
        failureReason: `request_${request.status}`,
      },
    })
    return { status: "skipped", reason: `request_${request.status}` }
  }

  if (reminder.scheduledFor > now) {
    return { status: "skipped", reason: "not_due" }
  }

  const recipientEmail = request.job.customer?.financialContact.email?.trim() ?? ""
  if (!recipientEmail) {
    await prismaAdmin.depositReminder.update({
      where: { id: reminder.id },
      data: {
        deliveryStatus: "skipped",
        failureReason: "missing_recipient_email",
      },
    })
    return { status: "skipped", reason: "missing_recipient_email" }
  }

  const recipientName = request.job.customer?.financialContact.name ?? null
  const tenantName = request.job.userProfile.displayName ?? null

  const messageId = await sendDepositReminderEmail({
    recipientEmail,
    recipientName,
    tenantName,
    requestDescription: request.description,
    amountCents: request.totalAmountCents,
    currency: request.currency,
    dueDate: request.dueDate,
    paymentUrl: request.externalPaymentUrl,
    reminderType: reminder.reminderType,
  })

  if (messageId === null) {
    await prismaAdmin.depositReminder.update({
      where: { id: reminder.id },
      data: {
        deliveryStatus: "failed",
        failureReason: "send_failed",
      },
    })
    return { status: "failed", reason: "send_failed" }
  }

  await prismaAdmin.depositReminder.update({
    where: { id: reminder.id },
    data: {
      deliveryStatus: "sent",
      sentAt: now,
      providerMessageId: messageId,
      failureReason: null,
    },
  })

  await prismaAdmin.depositGuardEvent.create({
    data: {
      userId: reminder.userId,
      jobId: request.jobId,
      depositRequestId: request.id,
      eventType: "reminder_sent",
      metadata: {
        reminderId: reminder.id,
        reminderType: reminder.reminderType,
        providerMessageId: messageId,
      } as never,
    },
  })

  return { status: "sent", messageId }
}
