import { Resend } from "resend"
import sanitizeHtmlLib from "sanitize-html"
import { prismaAdmin as prisma } from "@/lib/db/admin"
import { hasPlanFeature } from "@/lib/subscriptionPlans"
import {
  renderTemplate,
  buildTemplateVars,
  resolveVars,
  interpolate,
  DEFAULT_STAGE_1,
  DEFAULT_STAGE_2,
  DEFAULT_STAGE_3,
} from "./templates"
import type { TrackedInvoice } from "@/lib/generated/prisma/client"

const STAGE_DEFAULTS = {
  1: DEFAULT_STAGE_1,
  2: DEFAULT_STAGE_2,
  3: DEFAULT_STAGE_3,
} as const

let _resend: Resend | undefined
function getResend(): Resend {
  return _resend ?? (_resend = new Resend(process.env.RESEND_API_KEY!))
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

  const vars = buildTemplateVars({
    clientName: invoice.clientName,
    amountDue: invoice.amountDue,
    currency: invoice.currency,
    dueDate: invoice.dueDate,
    freelancerName,
    paymentUrl: undefined, // TODO: enrich from provider.getInvoiceDetails if needed
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
