import { Resend } from "resend"

let _resend: Resend | undefined
function getResend(): Resend {
  return _resend ?? (_resend = new Resend(process.env.RESEND_API_KEY!))
}

export interface SendDepositReminderInput {
  recipientEmail: string
  recipientName?: string | null
  tenantName?: string | null
  requestDescription?: string | null
  amountCents: number
  currency: string
  dueDate: Date
  paymentUrl?: string | null
  reminderType: string
}

export async function sendDepositReminderEmail(
  input: SendDepositReminderInput,
): Promise<string | null> {
  const from = `${process.env.RESEND_FROM_NAME!} <${process.env.RESEND_FROM_EMAIL!}>`
  const amount = new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: input.currency.toUpperCase(),
  }).format(input.amountCents / 100)
  const recipientName = input.recipientName?.trim() || "there"
  const tenantName = input.tenantName?.trim() || "PaidSoon"
  const dueDateLabel = new Intl.DateTimeFormat("en-AU", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(input.dueDate)
  const paymentLink = input.paymentUrl?.trim()

  const subject = `${tenantName}: deposit reminder for ${amount}`
  const html = `<p>Hi ${recipientName},</p>
<p>This is a ${input.reminderType.replace(/_/g, " ")} reminder for a deposit request from ${tenantName}.</p>
<p><strong>Amount due:</strong> ${amount}<br>
<strong>Due date:</strong> ${dueDateLabel}</p>
${input.requestDescription ? `<p>${input.requestDescription}</p>` : ""}
${paymentLink ? `<p><a href="${paymentLink}">Continue to payment</a></p>` : ""}
<p>Regards,<br>${tenantName}</p>`
  const text = [
    `Hi ${recipientName},`,
    `This is a ${input.reminderType.replace(/_/g, " ")} reminder for a deposit request from ${tenantName}.`,
    `Amount due: ${amount}`,
    `Due date: ${dueDateLabel}`,
    input.requestDescription ?? null,
    paymentLink ? `Continue to payment: ${paymentLink}` : null,
    `Regards,`,
    tenantName,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n")

  try {
    const result = await getResend().emails.send({
      from,
      to: input.recipientEmail,
      subject,
      html,
      text,
    })

    return result.data?.id ?? null
  } catch (error) {
    console.error("Failed to send DepositGuard reminder email", error)
    return null
  }
}
