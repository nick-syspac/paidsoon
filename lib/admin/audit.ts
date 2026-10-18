/**
 * Admin audit logging.
 *
 * Every admin lifecycle event MUST be written via this helper.
 * Uses `prismaAdmin` (bypasses RLS) — admin tables are isolated from tenant clients.
 */

import { prismaAdmin } from "@/lib/db/admin"
import type { Prisma } from "@/lib/generated/prisma/client"
import {
  AdminAuditAction, PlatformRoleType, TenantTrialAction,
  TenantTrialMutationSource, TenantTrialNotificationStatus, TenantTrialPlan,
} from "@/lib/generated/prisma/enums"
import { z } from "zod"
import { trialAccessReasonSchema } from "@/lib/billing/trialAccessInput"

export interface AdminAuditEventInput {
  actorUserId: string
  actorEmail: string
  platformRole: PlatformRoleType
  adminDeviceId?: string
  adminDeviceFingerprint?: string
  adminSessionId?: string // link to impersonation session (support console)
  action: AdminAuditAction
  targetType?: string
  targetId?: string
  targetUserId?: string // customer being acted upon (support console)
  resourceId?: string // specific resource being modified (support console)
  tenantId?: string
  ipAddress: string
  userAgent: string
  requestId: string
  success: boolean
  reason?: string
  metadata?: Record<string, unknown>
  details?: Record<string, unknown> // context-specific data (support console)
}

/** Deliberately no update/delete/upsert or access to other transaction models. */
export interface AdminAuditTransaction {
  readonly adminAuditEvent: {
    create(args: { data: Prisma.AdminAuditEventUncheckedCreateInput }): PromiseLike<unknown>
  }
}

/** Mandatory write on the caller's transaction; persistence errors MUST escape. */
export async function writeAdminEvent(
  tx: AdminAuditTransaction, event: AdminAuditEventInput,
): Promise<void> {
  await tx.adminAuditEvent.create({
    data: {
      actorUserId: event.actorUserId,
      actorEmail: event.actorEmail,
      platformRole: event.platformRole,
      adminDeviceId: event.adminDeviceId ?? null,
      adminDeviceFingerprint: event.adminDeviceFingerprint ?? null,
      adminSessionId: event.adminSessionId ?? null,
      action: event.action,
      targetType: event.targetType ?? null,
      targetId: event.targetId ?? null,
      targetUserId: event.targetUserId ?? null,
      resourceId: event.resourceId ?? null,
      tenantId: event.tenantId ?? null,
      ipAddress: event.ipAddress,
      userAgent: event.userAgent,
      requestId: event.requestId,
      success: event.success,
      reason: event.reason ?? null,
      metadata: event.metadata != null ? (event.metadata as Prisma.InputJsonValue) : undefined,
      details: event.details != null ? (event.details as Prisma.InputJsonValue) : undefined,
    },
  })
}

/**
 * Write an `AdminAuditEvent` row. Fire-and-forget safe — errors are logged
 * to stderr but not re-thrown so a logging failure never blocks the caller.
 */
export async function logAdminEvent(event: AdminAuditEventInput): Promise<void> {
  try {
    await writeAdminEvent(prismaAdmin, event)
  } catch (err) {
    console.error("[logAdminEvent] Failed to write audit event:", err)
  }
}

const accessSourceSchema = z.enum([
  "paid", "stripe_trial", "admin_grant", "onboarding_trial", "past_due_grace", "platform_owner", "none",
])
const planSchema = z.enum([...Object.values(TenantTrialPlan), "accountant_partner"])
const utcInstantSchema = z.date().transform((value) => value.toISOString())

// Allowlisted projection only: never serialize a profile, contact, SDK response,
// provider error, payload, key or session token into trial metadata.
const trialAuditSnapshotSchema = z.object({
  source: accessSourceSchema,
  effectivePlan: planSchema.nullable(),
  effectiveAccessExpiresAt: utcInstantSchema.nullable(),
  effectiveTrialExpiresAt: utcInstantSchema.nullable(),
  effectiveExpirySource: z.enum(["stripe_trial", "admin_grant", "onboarding_trial"]).nullable(),
  stripeTrialEndsAt: utcInstantSchema.nullable(),
  grantPlan: z.enum(TenantTrialPlan).nullable(),
  grantExpiresAt: utcInstantSchema.nullable(),
  billingPlan: planSchema.nullable(),
  billingStatus: z.enum([
    "active", "trialing", "past_due", "unpaid", "incomplete", "incomplete_expired", "paused", "canceled",
  ]).nullable(),
  stripeSubscriptionId: z.string().regex(/^sub_[A-Za-z0-9]+$/).nullable(),
  stripeCustomerId: z.string().regex(/^cus_[A-Za-z0-9]+$/).nullable(),
  billingAccessVersion: z.number().int().nonnegative(),
})

const trialAuditFailureSchema = z.object({
  // Internal classifications, not arbitrary provider messages/codes/stack traces.
  code: z.enum([
    "persistence_unavailable", "provider_rejected", "provider_unavailable",
    "provider_outcome_unknown", "state_conflict", "notification_blocked", "notification_failed",
  ]),
  stage: z.enum(["acceptance", "provider", "finalization", "recovery", "notification"]),
  retryable: z.boolean(),
})

const trialAuditResultSchema = z.object({
  status: z.enum(["pending", "reconciliation_required", "succeeded", "failed", "conflicted", "superseded"]),
  failure: trialAuditFailureSchema.optional(),
})

const trialAuditMetadataSchema = z.object({
  operationId: z.uuid(),
  operationAction: z.enum(TenantTrialAction),
  source: z.enum(TenantTrialMutationSource),
  occurredAt: utcInstantSchema,
  previous: trialAuditSnapshotSchema,
  after: trialAuditSnapshotSchema,
})

export type TrialAuditSnapshot = z.input<typeof trialAuditSnapshotSchema>
export type TrialAuditFailure = z.input<typeof trialAuditFailureSchema>
type TrialAuditResult = z.input<typeof trialAuditResultSchema>

type TrialAuditContext = z.input<typeof trialAuditMetadataSchema> & {
  actor: Pick<AdminAuditEventInput,
    "actorUserId" | "actorEmail" | "ipAddress" | "userAgent" | "requestId"
  > & {
    platformRole: "platform_owner"
    adminSessionId: string
    adminDeviceId?: string
  }
  tenantId: string
  /** Required business justification; never replaced with a failure summary. */
  reason: string
}

export type TrialAuditEventInput = TrialAuditContext & (
  | { subtype: "trial_attempt"; result: { status: "pending" } }
  | { subtype: "trial_result"; result: TrialAuditResult }
  | { subtype: "trial_recovery"; result: TrialAuditResult; originalSessionId: string; recoveringSessionId: string }
  | {
    subtype: "trial_notification"
    executor?: "owner" | "system"
    phase?: "attempt" | "result"
    result: { status: TenantTrialNotificationStatus; failure?: TrialAuditFailure }
  }
)

/**
 * Append a new owner event using the existing enum, never rewrite attempt history.
 * Auth/tenant/fence checks belong to the owner service; this helper is not a guard.
 * Actor email/request identity remain in existing privileged audit columns only.
 */
export async function writeTrialAuditEvent(
  tx: AdminAuditTransaction, event: TrialAuditEventInput,
): Promise<void> {
  const reason = trialAccessReasonSchema.parse(event.reason)
  const actor = z.object({
    actorUserId: z.string().min(1), actorEmail: z.string().min(1),
    platformRole: z.literal("platform_owner"), adminSessionId: z.string().min(1),
    adminDeviceId: z.string().min(1).optional(),
    ipAddress: z.string(), userAgent: z.string(), requestId: z.string().min(1),
  }).parse(event.actor)
  const tenantId = z.string().min(1).parse(event.tenantId)
  const metadata = trialAuditMetadataSchema.parse(event)
  const action = z.enum([
    "trial_attempt", "trial_result", "trial_recovery", "trial_notification",
  ]).parse(event.subtype)
  const result = action === "trial_notification"
    ? z.object({ status: z.enum(TenantTrialNotificationStatus), failure: trialAuditFailureSchema.optional() }).parse(event.result)
    : action === "trial_attempt"
      ? z.object({ status: z.literal("pending") }).parse(event.result)
      : trialAuditResultSchema.parse(event.result)
  const recovery = event.subtype === "trial_recovery" ? z.object({
    originalSessionId: z.string().min(1), recoveringSessionId: z.string().min(1),
  }).parse(event) : {}
  const notification = event.subtype === "trial_notification" ? z.object({
    executor: z.enum(["owner", "system"]).optional(), phase: z.enum(["attempt", "result"]).optional(),
  }).parse(event) : {}
  if (event.subtype === "trial_recovery" && event.recoveringSessionId !== actor.adminSessionId) {
    throw new Error("trial_recovery_session_mismatch")
  }

  await writeAdminEvent(tx, {
    ...actor, action: AdminAuditAction.admin_tenant_action,
    targetType: "user_profile", targetId: tenantId, targetUserId: tenantId,
    resourceId: metadata.operationId, tenantId, reason,
    success: action === "trial_attempt" || result.status === "succeeded" || result.status === "sent",
    metadata: { ...metadata, ...recovery, ...notification, action, result },
  })
}

/**
 * Small acceptance seam for upcoming owner services, NOT a preview/saga executor.
 * Supply the owner's locked transaction runner. Audit is inserted before the
 * DB-only acceptance callback (journal/reservation or local state); both commit
 * or roll back together. Call providers ONLY after this promise resolves, never
 * from the callback. No catch, provider dispatch, retry or reservation policy here.
 */
export async function withTrialAttemptAudit<Tx extends AdminAuditTransaction, T>(
  transaction: (work: (tx: Tx) => Promise<T>) => Promise<T>,
  event: Extract<TrialAuditEventInput, { subtype: "trial_attempt" }>,
  accept: (tx: Tx) => Promise<T>,
): Promise<T> {
  return transaction(async (tx) => {
    await writeTrialAuditEvent(tx, event)
    return accept(tx)
  })
}
