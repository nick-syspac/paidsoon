import "server-only"
import { z } from "zod"
import { TrialPreviewError } from "@/lib/billing/trialAccessPreview"

const nullableText = z.string().nullable()
const instant = z.iso.datetime().nullable()
const notificationStatus = z.enum(["not_requested", "pending", "sending", "sent", "failed", "unknown", "blocked", "superseded"])
const source = z.enum(["admin_grant", "stripe_trial"])
// Strip unknown fields at EVERY nesting level, including legacy stored JSON.
// These are response schemas, not permissive request schemas.
const snapshot = z.object({
  allowAccess: z.boolean(), effectivePlan: nullableText,
  source: z.enum(["paid", "stripe_trial", "admin_grant", "onboarding_trial", "past_due_grace", "platform_owner", "none"]),
  effectiveAccessExpiresAt: instant, effectiveTrialExpiresAt: instant,
  effectiveExpirySource: nullableText, effectiveExpiryPlan: nullableText,
  stripeTrialEndsAt: instant, billingPlan: nullableText, billingStatus: nullableText,
  grant: z.object({ plan: nullableText, startsAt: instant, expiresAt: instant, revokedAt: instant }).nullable(),
  restriction: nullableText, trialTimingPendingReconciliation: z.boolean(),
})
const target = z.object({ expiresAt: z.string(), localExpiresAt: z.string(), timeZone: z.string(), offset: z.string() })
const preview = z.object({
  operationId: z.uuid(), action: z.enum(["extend_or_grant", "revoke_grant"]), source,
  status: z.string(), previewVersion: z.number().int().nonnegative(), previewExpiresAt: z.string(),
  targetPlan: nullableText, target: target.nullable(),
  billingEffect: z.enum(["stripe_first_billing_timing", "application_access_only", "grant_removal_only"]), previous: snapshot,
})
const common = { operationId: z.uuid(), source }
const outcome = z.discriminatedUnion("status", [
  z.object({ ...common, status: z.literal("succeeded"), action: z.enum(["extend_or_grant", "revoke_grant"]),
    targetPlan: nullableText, targetExpiresAt: instant, version: z.number().int().nonnegative(),
    notificationStatus, after: snapshot, notification: z.object({ status: notificationStatus }).optional() }),
  z.object({ ...common, status: z.literal("superseded"), version: z.number().int().nonnegative(), notificationStatus, after: snapshot }),
  z.object({ ...common, status: z.literal("failed"), failureCode: z.literal("provider_rejected") }),
  z.object({ ...common, status: z.enum(["pending", "reconciliation_required"]), reconciliationRequired: z.literal(true) }),
])

function project<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw new TrialPreviewError("trial_operation_unavailable", 503)
  return parsed.data
}
export function projectTrialPreview(value: unknown): z.output<typeof preview> { return project(preview, value) }
export function projectTrialOutcome(value: unknown): z.output<typeof outcome> { return project(outcome, value) }
export function projectTrialSnapshot(value: unknown): z.output<typeof snapshot> { return project(snapshot, value) }
export function projectTrialNotification(value: unknown): { status: z.output<typeof notificationStatus> } {
  return project(z.object({ status: notificationStatus }), value)
}