import { Resend } from "resend"
import { randomBytes } from "crypto"
import { prismaAdmin as prisma } from "@/lib/db/admin"
import { sanitizeHtml } from "./htmlSanitizer"
import { hasPlanFeature } from "@/lib/subscriptionPlans"
import {
  buildTemplateVars,
  resolveVars,
  interpolate,
  DEFAULT_STAGE_1,
  DEFAULT_STAGE_2,
  DEFAULT_STAGE_3,
} from "./templates"
import {
  CONTACT_ENQUIRY_RECIPIENTS,
  type ContactEnquiryType,
} from "./contactEnquiryRouting"
import { isUndeliverableAddress } from "./deliveryGuard"
import type { TrackedInvoice, PromiseToPay } from "@/lib/generated/prisma/client"
import { Prisma } from "@/lib/generated/prisma/client"

/**
 * Resolve the display name to use as {{yourName}} in reminder emails.
 * Priority: UserProfile.displayName → user_metadata.full_name → email prefix → fallback
 */
export function resolveFreelancerName(
  displayName: string | null | undefined,
  metadataFullName: string | null | undefined,
  email: string | null | undefined,
): string {
  return displayName ?? metadataFullName ?? email?.split("@")[0] ?? "Your freelancer"
}

const STAGE_DEFAULTS = {
  1: DEFAULT_STAGE_1,
  2: DEFAULT_STAGE_2,
  3: DEFAULT_STAGE_3,
} as const

/**
 * Sentinel returned instead of a Resend message id when delivery was suppressed
 * because the recipient domain is reserved/undeliverable. Callers treat this as
 * success so the reminder state machine still advances.
 */
export const SUPPRESSED_MESSAGE_ID = "suppressed-undeliverable-domain"

/**
 * Sentinel returned instead of a Resend message id when a reminder for this
 * `(trackedInvoiceId, stage)` pair was already logged — either by an earlier
 * pass (fast-path check) or by a concurrent winner (unique-constraint
 * backstop). Callers treat this as success so the reminder state machine
 * still advances, without sending a second email.
 */
export const ALREADY_SENT_MESSAGE_ID = "already-sent-for-stage"

function isUniqueConstraintViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
}

let _resend: Resend | undefined
function getResend(): Resend {
  return _resend ?? (_resend = new Resend(process.env.RESEND_API_KEY!))
}

/**
 * Generate a cryptographically random token for the promise-to-pay client link.
 */
export function generateP2PToken(): string {
  return randomBytes(32).toString("hex")
}

// ---------------------------------------------------------------------------
// HTML sanitisation — applied to all htmlBody content before sending.
// Allows safe formatting elements; strips scripts, iframes, event handlers.
// Moved to ./htmlSanitizer so it can also be imported from client components
// (e.g. the dashboard's email detail modal) without pulling in server-only
// deps (prismaAdmin, resend) that this file imports.
// ---------------------------------------------------------------------------

function sanitizeHeaderText(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim().slice(0, 200)
}

export type ContactEnquiryEmailInput = {
  name: string
  email: string
  enquiryType: ContactEnquiryType
  message: string
}

/**
 * Send a contact enquiry email to the internal team mailbox for the selected type.
 * Returns Resend message ID on success, null on failure.
 */
export async function sendContactEnquiryEmail(input: ContactEnquiryEmailInput): Promise<string | null> {
  const recipient = CONTACT_ENQUIRY_RECIPIENTS[input.enquiryType]
  const from = `${process.env.RESEND_FROM_NAME!} <${process.env.RESEND_FROM_EMAIL!}>`
  const subject = `[Contact] ${input.enquiryType} enquiry from ${sanitizeHeaderText(input.name)}`
  const safeName = sanitizeHtml(input.name)
  const safeEmail = sanitizeHtml(input.email)
  const safeMessage = sanitizeHtml(input.message).replace(/\n/g, "<br>")

  try {
    const result = await getResend().emails.send({
      from,
      to: recipient,
      replyTo: input.email,
      subject,
      html: `<p><strong>Name:</strong> ${safeName}</p>
<p><strong>Email:</strong> ${safeEmail}</p>
<p><strong>Enquiry type:</strong> ${input.enquiryType}</p>
<p><strong>Message:</strong></p>
<p>${safeMessage}</p>`,
      text: `Name: ${input.name}\nEmail: ${input.email}\nEnquiry type: ${input.enquiryType}\n\nMessage:\n${input.message}`,
    })

    return result.data?.id ?? null
  } catch (err) {
    console.error("Failed to send contact enquiry email", {
      enquiryType: input.enquiryType,
      error: err,
    })
    return null
  }
}

/**
 * Resolve the "From" address and reply-to for a user, per the sender-identity
 * ladder: Starter gets the PaidSoon system address with a custom reply-to;
 * Solo adds a custom sender display name alongside the system address; Small
 * Business (and Accountant Partner) adds a fully custom, verified from-domain.
 * This is the single enforcement point for sender identity — settings routes
 * only persist values, they do not decide what gets used to send.
 */
export async function resolveFromAddress(userId: string): Promise<{
  from: string
  replyTo?: string
}> {
  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    select: { subscriptionTier: true },
  })
  const settings = await prisma.emailSettings.findUnique({
    where: { userId },
  })

  const canUseVerifiedDomain = hasPlanFeature(profile?.subscriptionTier, "verified_from_domain")
  const canUseCustomSenderName = hasPlanFeature(profile?.subscriptionTier, "custom_sender_name")
  const canUseCustomReplyTo = hasPlanFeature(profile?.subscriptionTier, "custom_reply_to")

  if (canUseVerifiedDomain && settings?.fromEmail && settings.resendVerified) {
    const name = settings.fromName ?? settings.fromEmail
    return {
      from: `${name} <${settings.fromEmail}>`,
      replyTo: settings.replyTo ?? settings.fromEmail,
    }
  }

  const name =
    canUseCustomSenderName && settings?.fromName
      ? settings.fromName
      : process.env.RESEND_FROM_NAME!

  return {
    from: `${name} <${process.env.RESEND_FROM_EMAIL!}>`,
    replyTo: canUseCustomReplyTo ? settings?.replyTo ?? undefined : undefined,
  }
}

/**
 * Send a follow-up email for a tracked invoice at the given stage.
 * Logs the send to email_logs. Returns the Resend message ID on success.
 */
export async function sendFollowUpEmail(
  invoice: TrackedInvoice,
  stage: 1 | 2 | 3,
  freelancerEmail: string,
  freelancerName: string
): Promise<string | null> {
  // Fast-path dedup check: skip the send entirely if this stage was already
  // logged. The @@unique([trackedInvoiceId, stage]) constraint is the durable
  // backstop for the race this check can't fully close on its own.
  const existingLog = await prisma.emailLog.findFirst({
    where: { trackedInvoiceId: invoice.id, stage },
    select: { id: true },
  })
  if (existingLog) {
    return ALREADY_SENT_MESSAGE_ID
  }

  const { from, replyTo } = await resolveFromAddress(invoice.userId)

  // Resolve p2pLink for Business+ users. Generate and persist the token if
  // the invoice doesn't have one yet.
  let p2pLink: string | undefined
  const profile = await prisma.userProfile.findUnique({
    where: { userId: invoice.userId },
    select: { subscriptionTier: true },
  })
  if (hasPlanFeature(profile?.subscriptionTier, "promise_to_pay_tracking")) {
    let token = invoice.p2pToken
    if (!token) {
      token = generateP2PToken()
      await prisma.trackedInvoice.update({
        where: { id: invoice.id },
        data: { p2pToken: token },
      })
    }
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.VERCEL_URL ?? ""
    p2pLink = `${appUrl}/promise/${token}`
  }

  const vars = buildTemplateVars({
    clientName: invoice.clientName,
    amountDue: invoice.amountDue,
    currency: invoice.currency,
    dueDate: invoice.dueDate,
    freelancerName,
    paymentUrl: invoice.paymentUrl ?? undefined,
    p2pLink,
  })

  // Check for a custom template saved by this user for this stage.
  // prismaAdmin is used here: send path runs in cron context (RLS bypassed by design).
  const customTemplate = await prisma.emailTemplate.findUnique({
    where: { userId_stage: { userId: invoice.userId, stage } },
  })

  let subject: string
  let html: string
  let text: string

  if (customTemplate) {
    const resolved = resolveVars(stage, vars)
    subject = interpolate(customTemplate.subject, resolved)
    html = sanitizeHtml(interpolate(customTemplate.htmlBody, resolved))
    text = interpolate(customTemplate.textBody, resolved)
  } else {
    const defaults = STAGE_DEFAULTS[stage]
    const resolved = resolveVars(stage, vars)
    subject = interpolate(defaults.subject, resolved)
    html = sanitizeHtml(interpolate(defaults.htmlBody, resolved))
    text = interpolate(defaults.textBody, resolved)
  }

  try {
    // Reserved / undeliverable recipient domains (e.g. the `.test` addresses used
    // by the development seed) are never handed to Resend. The send is still
    // recorded in email_logs with a null message id so reminder history and the
    // cron state machine advance, but no outbound message is attempted.
    if (isUndeliverableAddress(invoice.clientEmail)) {
      try {
        await prisma.emailLog.create({
          data: {
            trackedInvoiceId: invoice.id,
            stage,
            resendMessageId: null,
            fromAddress: from,
            subject,
            htmlBody: html,
            textBody: text,
          },
        })
      } catch (err) {
        if (!isUniqueConstraintViolation(err)) throw err
        return ALREADY_SENT_MESSAGE_ID
      }
      return SUPPRESSED_MESSAGE_ID
    }

    const result = await getResend().emails.send({
      from,
      to: invoice.clientEmail,
      replyTo,
      subject,
      html,
      text,
    })

    const messageId = result.data?.id ?? null

    try {
      await prisma.emailLog.create({
        data: {
          trackedInvoiceId: invoice.id,
          stage,
          resendMessageId: messageId,
          fromAddress: from,
          subject,
          htmlBody: html,
          textBody: text,
        },
      })
    } catch (err) {
      // A concurrent invocation won the race and logged this stage first. The
      // email above was already dispatched to Resend by this call, so treat
      // it as an already-sent case rather than a hard error — the state
      // machine still advances as if this send succeeded.
      if (!isUniqueConstraintViolation(err)) throw err
      return ALREADY_SENT_MESSAGE_ID
    }

    return messageId
  } catch (err) {
    console.error(`Failed to send email for invoice ${invoice.id} stage ${stage}:`, err)
    return null
  }
}

// ---------------------------------------------------------------------------
// P2P Notification Emails — sent to the freelancer (not the client)
// ---------------------------------------------------------------------------

function formatCurrency(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100)
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}

/**
 * Send a promise-to-pay notification email to the freelancer.
 * Used for both "promise received" (client committed) and "promise broken" (date passed).
 * brokenCount: total number of broken promises for this client email (used in breach email).
 */
export async function sendP2PNotification(
  type: "promise_received" | "promise_broken",
  invoice: TrackedInvoice,
  promise: PromiseToPay,
  freelancerEmail: string,
  freelancerName: string,
  brokenCount?: number,
): Promise<void> {
  const from = `${process.env.RESEND_FROM_NAME!} <${process.env.RESEND_FROM_EMAIL!}>`
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.VERCEL_URL ?? ""
  const dashboardLink = `${appUrl}/dashboard`
  const amountLabel = promise.promisedAmount
    ? formatCurrency(promise.promisedAmount, invoice.currency)
    : formatCurrency(invoice.amountDue, invoice.currency)
  const promisedDateLabel = formatDate(promise.promisedPayBy)

  let subject: string
  let html: string
  let text: string

  if (type === "promise_received") {
    subject = `${invoice.clientName} has promised to pay by ${promisedDateLabel}`
    html = `<p>Hi ${freelancerName},</p>
<p>Good news! <strong>${invoice.clientName}</strong> has committed to paying <strong>${amountLabel}</strong> by <strong>${promisedDateLabel}</strong>.</p>
${promise.clientNotes ? `<p><em>Their note: &ldquo;${sanitizeHtml(promise.clientNotes)}&rdquo;</em></p>` : ""}
<p>We&apos;ll pause automated reminders while this commitment is active. If payment doesn&apos;t arrive by the promised date, we&apos;ll let you know.</p>
<p><a href="${dashboardLink}">View in dashboard →</a></p>
<p>Thanks,<br>PaidSoon</p>`
    text = `Hi ${freelancerName},

Good news! ${invoice.clientName} has committed to paying ${amountLabel} by ${promisedDateLabel}.
${promise.clientNotes ? `Their note: "${promise.clientNotes}"\n` : ""}
We'll pause automated reminders while this commitment is active. If payment doesn't arrive by the promised date, we'll let you know.

View in dashboard: ${dashboardLink}

Thanks,
PaidSoon`
  } else {
    const brokenMsg =
      brokenCount && brokenCount > 1
        ? `This is the ${brokenCount}th time this client has missed a commitment.`
        : ""
    subject = `${invoice.clientName} missed their payment commitment (${promisedDateLabel})`
    html = `<p>Hi ${freelancerName},</p>
<p><strong>${invoice.clientName}</strong> promised to pay <strong>${amountLabel}</strong> by <strong>${promisedDateLabel}</strong>, but that date has passed without payment.</p>
${brokenMsg ? `<p><em>${brokenMsg}</em></p>` : ""}
<p>Visit your dashboard to decide what to do next — you can resume the email sequence, pause the invoice, or mark it as resolved.</p>
<p><a href="${dashboardLink}">Go to dashboard →</a></p>
<p>Thanks,<br>PaidSoon</p>`
    text = `Hi ${freelancerName},

${invoice.clientName} promised to pay ${amountLabel} by ${promisedDateLabel}, but that date has passed without payment.
${brokenMsg ? `${brokenMsg}\n` : ""}
Visit your dashboard to decide what to do next — you can resume the email sequence, pause the invoice, or mark it as resolved.

Go to dashboard: ${dashboardLink}

Thanks,
PaidSoon`
  }

  try {
    // Seeded / development accounts use reserved `.test` addresses — never
    // attempt an outbound send for those.
    if (isUndeliverableAddress(freelancerEmail)) return

    await getResend().emails.send({ from, to: freelancerEmail, subject, html, text })
  } catch (err) {
    console.error(`Failed to send P2P notification (${type}) for invoice ${invoice.id}:`, err)
  }
}
