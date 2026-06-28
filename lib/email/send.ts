import { Resend } from "resend"
import { randomBytes } from "crypto"
import sanitizeHtmlLib from "sanitize-html"
import { prismaAdmin as prisma } from "@/lib/db/admin"
import { hasPlanFeature } from "@/lib/subscriptionPlans"
import {
  buildTemplateVars,
  resolveVars,
  interpolate,
  DEFAULT_STAGE_1,
  DEFAULT_STAGE_2,
  DEFAULT_STAGE_3,
} from "./templates"
import type { TrackedInvoice, PromiseToPay } from "@/lib/generated/prisma/client"

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
// ---------------------------------------------------------------------------

const SANITIZE_OPTIONS: sanitizeHtmlLib.IOptions = {
  allowedTags: [
    "p", "br", "strong", "em", "u", "s", "ul", "ol", "li",
    "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "a", "span", "div",
  ],
  allowedAttributes: {
    a: ["href", "target", "rel"],
    span: ["style"],
    p: ["style"],
  },
  allowedSchemes: ["https", "http", "mailto"],
  disallowedTagsMode: "discard",
}

export function sanitizeHtml(html: string): string {
  return sanitizeHtmlLib(html, SANITIZE_OPTIONS)
}

/**
 * Resolve the "From" address for a user.
 * Tiers with own_email_address entitlement and a verified sender use custom address.
 * Other tiers (or unverified sender) use the system domain.
 */
export async function resolveFromAddress(userId: string): Promise<{
  from: string
  replyTo?: string
}> {
  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    select: { subscriptionTier: true },
  })

  if (hasPlanFeature(profile?.subscriptionTier, "own_email_address")) {
    const settings = await prisma.emailSettings.findUnique({
      where: { userId },
    })
    if (settings?.fromEmail && settings.resendVerified) {
      const name = settings.fromName ?? settings.fromEmail
      return {
        from: `${name} <${settings.fromEmail}>`,
        replyTo: settings.replyTo ?? settings.fromEmail,
      }
    }
  }

  // Fallback: system domain
  return {
    from: `${process.env.RESEND_FROM_NAME!} <${process.env.RESEND_FROM_EMAIL!}>`,
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
    paymentUrl: undefined, // TODO: enrich from provider.getInvoiceDetails if needed
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
    const result = await getResend().emails.send({
      from,
      to: invoice.clientEmail,
      replyTo,
      subject,
      html,
      text,
    })

    const messageId = result.data?.id ?? null

    await prisma.emailLog.create({
      data: {
        trackedInvoiceId: invoice.id,
        stage,
        resendMessageId: messageId,
        fromAddress: from,
        subject,
      },
    })

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
    await getResend().emails.send({ from, to: freelancerEmail, subject, html, text })
  } catch (err) {
    console.error(`Failed to send P2P notification (${type}) for invoice ${invoice.id}:`, err)
  }
}
