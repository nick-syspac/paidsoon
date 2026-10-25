import "server-only"
import { z } from "zod"
import { PLAN_CATALOG, type SubscriptionTier } from "@/lib/subscriptionPlans"
import type { LocalTrialOperationResult } from "@/lib/billing/trialAccessOperations"
import type { StripeTrialExtensionResult } from "@/lib/billing/stripeTrialExtension"
import type { TrialAccessContact } from "@/lib/email/trialAccessContact"
import { trialContactEmail } from "@/lib/email/trialAccessContact"

type Immutable<T> = T extends object ? { readonly [K in keyof T]: Immutable<T[K]> } : T
export type CompletedTrialNotificationResult = Immutable<LocalTrialOperationResult | StripeTrialExtensionResult>

/** Persist this exact provider payload before dispatch (task 7.3). No invoice,
 * custom sender, internal reason, provider references or operation key in copy. */
export interface TrialAccessNotificationPayload {
  readonly from: string
  readonly to: string
  readonly subject: string
  readonly html: string
  readonly text: string
}

const planSchema = z.enum(["essentials", "business_control", "small_business", "business_pro", "accountant_partner"])
const instantSchema = z.iso.datetime().refine((value) => new Date(value).getTime() % 1000 === 0)
// Project only verified customer-safe facts; never interpolate arbitrary journal fields.
const resultSchema = z.object({
  status: z.literal("succeeded"), action: z.enum(["extend_or_grant", "revoke_grant"]),
  source: z.enum(["stripe_trial", "admin_grant"]),
  targetPlan: planSchema.nullable(), targetExpiresAt: instantSchema.nullable(),
  after: z.object({
    allowAccess: z.boolean(), effectivePlan: planSchema.nullable(),
    source: z.enum(["paid", "stripe_trial", "admin_grant", "onboarding_trial", "past_due_grace", "platform_owner", "none"]),
    effectiveAccessExpiresAt: instantSchema.nullable(), stripeTrialEndsAt: instantSchema.nullable(),
    trialTimingPendingReconciliation: z.boolean(),
  }),
})

function invalid(): never { throw new Error("trial_notification_invalid_input") }
function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;")
}
function displayName(value: string | null): string {
  // Plain text, not caller-supplied HTML. Remove controls in text as well as HTML.
  return value?.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/gu, " ").trim().slice(0, 200) || "there"
}
function planLabel(value: SubscriptionTier): string { return PLAN_CATALOG[value].name }
function expiry(value: string): string {
  return `${new Date(value).toISOString().replace("T", " ").replace(".000Z", "")} UTC (exclusive)`
}

/** Uses the existing app setting (not the public marketing-site origin).
 * VERCEL_URL is a hostname; never emit scheme-less links or accept credentials,
 * javascript URLs, query strings or fragments from configuration. */
function subscriptionUrl(env: NodeJS.ProcessEnv): string {
  const configured = env.NEXT_PUBLIC_APP_URL ?? (env.VERCEL_URL ? `https://${env.VERCEL_URL}` : "")
  try {
    if (/[\s<>"'\\]/u.test(configured)) return invalid()
    const url = new URL(configured)
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    if ((url.protocol !== "https:" && !(url.protocol === "http:" && local)) || url.username || url.password ||
        url.search || url.hash || url.pathname !== "/") return invalid()
    return new URL("/settings/subscription", url.origin).href
  } catch { return invalid() }
}

/** Internal-only: result/contact must come from completed, verified owner services,
 * never a request body or preview. This builder performs no lookup, send or claim.
 * UTC is deliberately explicit; no recipient timezone is recorded by this feature. */
export function buildTrialAccessNotification(
  result: CompletedTrialNotificationResult,
  contact: Readonly<TrialAccessContact>,
  env: NodeJS.ProcessEnv = process.env,
): Readonly<TrialAccessNotificationPayload> {
  const parsed = resultSchema.safeParse(result)
  if (!parsed.success) return invalid()
  const r = parsed.data
  const to = trialContactEmail(contact.email)
  const fromEmail = trialContactEmail(env.RESEND_FROM_EMAIL)
  if (!to || !fromEmail || !["stripe_billing", "owner_fallback"].includes(contact.source ?? "")) return invalid()
  const fromName = displayName(env.RESEND_FROM_NAME?.trim() || "PaidSoon").replace(/[<>"\\]/g, "")
  const from = `${fromName} <${fromEmail}>`
  const url = subscriptionUrl(env)
  const paragraphs: string[] = []
  let subject: string
  if (r.action === "revoke_grant") {
    if (r.source !== "admin_grant") return invalid()
    subject = "Your temporary PaidSoon access grant has been removed"
    paragraphs.push("Your temporary administrator-granted PaidSoon access has been removed. This removes only that grant; Stripe billing is unchanged.")
    if (!r.after.allowAccess) {
      paragraphs.push("No independent access currently remains. Subscription-controlled PaidSoon features are no longer available. You can still open subscription settings to review billing and access options.")
    } else {
      if (!r.after.effectivePlan) return invalid()
      const label = planLabel(r.after.effectivePlan)
      switch (r.after.source) {
        case "platform_owner":
          paragraphs.push(`Platform owner internal access remains available with the existing ${label} plan limits. This is not a paid subscription or a trial; Stripe billing is unchanged.`)
          break
        case "paid":
          paragraphs.push(`Your independent paid ${label} subscription access remains unchanged. Removing the grant does not cancel your subscription or change its charges.`)
          break
        case "past_due_grace":
          paragraphs.push(`Your existing ${label} billing grace access remains unchanged, subject to billing resolution. Please review subscription settings; the removed grant does not settle outstanding billing.`)
          break
        case "stripe_trial":
          if (r.after.trialTimingPendingReconciliation) {
            paragraphs.push(`Your independent ${label} Stripe trial access remains unchanged. Its end timing is pending reconciliation; check subscription settings for current billing details.`)
          } else {
            if (!r.after.stripeTrialEndsAt) return invalid()
            paragraphs.push(`Your independent ${label} Stripe trial remains unchanged, with a recorded trial end of ${expiry(r.after.stripeTrialEndsAt)}.`)
          }
          break
        case "onboarding_trial":
          if (!r.after.effectiveAccessExpiresAt) return invalid()
          paragraphs.push(`Your independent ${label} onboarding trial access remains available until ${expiry(r.after.effectiveAccessExpiresAt)}.`)
          break
        default: return invalid()
      }
    }
  } else {
    if (!r.targetPlan || !r.targetExpiresAt || (r.source === "admin_grant" && r.targetPlan === "accountant_partner")) return invalid()
    const label = planLabel(r.targetPlan)
    if (r.source === "stripe_trial") {
      subject = "Your PaidSoon Stripe trial has been extended"
      paragraphs.push(`Your ${label} Stripe trial has been extended to ${expiry(r.targetExpiresAt)}.`,
        "This changes the timing of first billing for this Stripe trial. Your subscription plan is unchanged. Future charges remain subject to your Stripe subscription settings; this is not a waiver of future charges.")
    } else {
      subject = "Your temporary PaidSoon application access"
      paragraphs.push(`You have temporary ${label} PaidSoon application access until ${expiry(r.targetExpiresAt)}.`,
        "PaidSoon access only — Stripe billing unchanged. This grant does not create or restart a Stripe subscription, trigger a charge, or postpone or change existing Stripe charges.")
    }
  }
  const greeting = `Hi ${displayName(contact.name)},`
  return Object.freeze({ from, to, subject,
    html: [`<p>${escapeHtml(greeting)}</p>`, ...paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`),
      `<p><a href="${escapeHtml(url)}">Review PaidSoon subscription and access</a></p>`, "<p>Thanks,<br>PaidSoon</p>"].join("\n"),
    text: [greeting, ...paragraphs, `Review PaidSoon subscription and access: ${url}`, "Thanks,\nPaidSoon"].join("\n\n"),
  })
}