import "server-only"
import { readPlatformOwnerAccess } from "@/lib/billing/platformOwnerAccess"
import { randomUUID } from "node:crypto"
import { z } from "zod"
import { requireAdminElevation, type AdminGuardContext } from "@/lib/admin/guard"
import { writeTrialAuditEvent } from "@/lib/admin/audit"
import { prismaAdmin } from "@/lib/db/admin"
import type { Prisma, TenantTrialGrant, TenantTrialNotification, TenantTrialOperation, UserProfile } from "@/lib/generated/prisma/client"
import { lockTenantBilling } from "@/lib/billing/tenantBillingLock"
import { assertTrialAccessOwner, safeTrialAccessSnapshot, TrialPreviewError } from "@/lib/billing/trialAccessPreview"
import { resolveEffectiveAccess } from "@/lib/billing/effectiveAccess"
import { trialOperationAuditSnapshot, type TrialOperationRequestContext } from "@/lib/billing/trialAccessOperations"
import { createStripeClient } from "@/lib/billing/stripeClient"
import { resolveTrialAccessContact, type TrialAccessContact } from "@/lib/email/trialAccessContact"
import { readTrialAccessOwnerContact } from "@/lib/email/trialAccessContactService"
import { buildTrialAccessNotification, type CompletedTrialNotificationResult, type TrialAccessNotificationPayload } from "@/lib/email/trialAccessNotification"
import { createTrialAccessNotificationSender, type TrialNotificationSendOutcome } from "@/lib/email/sendTrialAccessNotification"

type Transaction = <T>(run: (tx: Prisma.TransactionClient) => Promise<T>) => Promise<T>
export interface TrialNotificationDeliveryOutcome {
  status: TenantTrialNotification["status"]
  failureCode: string | null
}
export interface TrialDeliveryDependencies {
  transaction: Transaction
  now: () => Date
  contact: (profile: UserProfile) => Promise<TrialAccessContact>
  send: (payload: Readonly<TrialAccessNotificationPayload>, key: string) => Promise<TrialNotificationSendOutcome>
  env?: NodeJS.ProcessEnv
}
const RETENTION = 24 * 60 * 60 * 1000
const LEASE = 60_000
const unsentCodes = new Set(["invalid_payload", "invalid_key", "reserved_recipient", "missing_configuration", "provider_rejected"])
const fail = (code: string, status: 404 | 409 | 503 = 409): never => { throw new TrialPreviewError(code, status) }
const project = (row: TenantTrialNotification): TrialNotificationDeliveryOutcome => ({ status: row.status, failureCode: row.failureCode })
const json = (value: unknown): Prisma.InputJsonObject => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject
const payloadSchema = z.object({ from: z.string().min(1), to: z.email(), subject: z.string().min(1), html: z.string().min(1), text: z.string().min(1) }).strict()
function provenUnsent(row: TenantTrialNotification): boolean {
  return (row.attempts === 0 && row.firstAttemptAt === null && ["pending", "blocked"].includes(row.status)) ||
    (row.status === "failed" && row.attempts > 0 && row.firstAttemptAt !== null &&
      unsentCodes.has(row.failureCode?.replace(/^unsent\//, "") ?? "") && row.failureCode?.startsWith("unsent/") === true)
}
function obsolete(op: TenantTrialOperation, profile: UserProfile,
  grant: TenantTrialGrant | null, access: ReturnType<typeof resolveEffectiveAccess>, now: Date): boolean {
  const stored = op.result as Record<string, unknown> | null
  if (!stored || stored.status !== "succeeded") return true
  if (op.action === "extend_or_grant") {
    if (!op.targetExpiresAt || now >= op.targetExpiresAt) return true
    if (op.source === "admin_grant" && (!grant || grant.revokedAt !== null || grant.lastOperationId !== op.id ||
        grant.plan !== op.targetPlan || +grant.expiresAt !== +op.targetExpiresAt || !access.allowAccess || access.source !== "admin_grant")) return true
    if (op.source === "stripe_trial" && (profile.stripeSubscriptionId !== op.stripeSubscriptionId ||
        profile.stripeCustomerId !== op.stripeCustomerId || profile.subscriptionStatus !== "trialing" ||
        !profile.trialEndsAt || +profile.trialEndsAt !== +op.targetExpiresAt || access.effectiveTier !== op.targetPlan)) return true
  } else if (!grant || grant.revokedAt === null || grant.lastOperationId !== op.id) return true
  // Includes revocation's independent remaining access: never regenerate old copy
  // to reflect a new paid/trial/grant source or an elapsed onboarding expiry.
  const before = stored.after as Record<string, unknown> | undefined
  const current = safeTrialAccessSnapshot(access, profile)
  return !before || (["allowAccess", "effectivePlan", "source", "effectiveAccessExpiresAt", "stripeTrialEndsAt",
    "trialTimingPendingReconciliation"] as const).some((key) => before[key] !== current[key])
}

/** INTERNAL system exception, not a route/API authorization option. Only trusted
 * post-commit access executors call this. It independently verifies a completed,
 * requested tenant operation. No owner guard is fabricated from journal data.
 * Tenant lock -> delivery CAS/fence; no access, usage or operation writes. */
function deliveryEngine(dependencies?: TrialDeliveryDependencies) {
  const transaction: Transaction = dependencies?.transaction ?? ((run) => prismaAdmin.$transaction(run, { timeout: 20000 }))
  const sender = createTrialAccessNotificationSender()
  const send = dependencies?.send ?? sender.send
  const clock = (): Date => {
    const value = new Date(dependencies?.now() ?? new Date())
    if (!Number.isFinite(+value)) return fail("trial_notification_unavailable", 503)
    return value
  }
  const contact = dependencies?.contact ?? ((profile: UserProfile) => resolveTrialAccessContact(profile, {
    customer: async (id) => {
      const c = await createStripeClient({ maxNetworkRetries: 0 }).customers.retrieve(id)
      return c.deleted ? { id: c.id, deleted: true } : { id: c.id, email: c.email, name: c.name, metadata: c.metadata }
    }, owner: readTrialAccessOwnerContact,
  }))
  async function deliver(userId: string, operationId: string, request: TrialOperationRequestContext,
    owner?: AdminGuardContext): Promise<TrialNotificationDeliveryOutcome> {
    userId = z.string().trim().min(1).parse(userId)
    operationId = z.uuid().parse(operationId).toLowerCase()
    async function locked<T>(run: (tx: Prisma.TransactionClient, profile: UserProfile, op: TenantTrialOperation,
      row: TenantTrialNotification | null) => Promise<T>): Promise<T> {
      return transaction(async (tx) => {
        await lockTenantBilling(tx, userId)
        if (owner) assertTrialAccessOwner(owner, clock())
        const op = await tx.tenantTrialOperation.findUnique({ where: { id: operationId } })
        if (!op || op.userId !== userId || (owner && (op.actorUserId !== owner.userId || op.adminSessionId !== owner.adminSession.id))) {
          return fail("trial_notification_not_found", 404)
        }
        const profile = await tx.userProfile.findUnique({ where: { userId } })
        if (!profile) return fail("trial_notification_not_found", 404)
        const row = await tx.tenantTrialNotification.findUnique({ where: { operationId } })
        if (row && row.userId !== userId) return fail("trial_notification_not_found", 404)
        return run(tx, profile, op, row)
      })
    }
    async function audit(tx: Prisma.TransactionClient, profile: UserProfile, op: TenantTrialOperation,
      status: TenantTrialNotification["status"], phase: "attempt" | "result") {
      const grant = await tx.tenantTrialGrant.findUnique({ where: { userId } })
      const billingRisks = await tx.tenantBillingRisk.findMany({ where: { userId } })
      const snapshot = trialOperationAuditSnapshot(resolveEffectiveAccess({ platformOwnerAccess: await readPlatformOwnerAccess(userId), profile, grant, billingRisks }, clock()), profile)
      // System audit retains original human attribution but explicitly records the
      // executor. Current request context is NEVER copied from an earlier request.
      const original = owner ? null : await tx.adminAuditEvent.findFirst({ where: { resourceId: op.id, tenantId: userId,
        actorUserId: op.actorUserId, adminSessionId: op.adminSessionId, action: "admin_tenant_action",
        metadata: { path: ["action"], equals: "trial_attempt" } } })
      if (!owner && !original) return fail("trial_notification_audit_unavailable", 503)
      await writeTrialAuditEvent(tx, { subtype: "trial_notification", operationId: op.id, operationAction: op.action,
        source: op.source, tenantId: userId, reason: op.reason, occurredAt: clock(), previous: snapshot, after: snapshot,
        executor: owner ? "owner" : "system", phase,
        actor: { actorUserId: op.actorUserId, actorEmail: owner?.userEmail ?? original!.actorEmail, platformRole: "platform_owner",
          adminSessionId: owner?.adminSession.id ?? op.adminSessionId,
          ...(owner?.adminSession.adminDeviceId ? { adminDeviceId: owner.adminSession.adminDeviceId } : {}), ...request },
        result: { status, ...(status === "failed" || status === "blocked" || status === "unknown" ? {
          failure: { code: status === "failed" ? "notification_failed" as const : status === "blocked" ? "notification_blocked" as const : "provider_outcome_unknown" as const,
            stage: "notification" as const, retryable: status === "failed" },
        } : {}) } })
    }
    const accepted = await locked(async (tx, profile, op, row) => {
      if (!op.notify) return { outcome: { status: "not_requested" as const, failureCode: null } }
      if (op.status !== "succeeded") return fail("trial_notification_access_unconfirmed")
      if (!row) return fail("trial_notification_not_found", 404)
      if (["sent", "not_requested", "superseded"].includes(row.status)) return { outcome: project(row) }
      if (row.sentAt !== null || row.providerMessageId !== null) return fail("trial_notification_evidence_invalid", 503)
      if (row.status === "sending" && row.leaseExpiresAt && row.leaseExpiresAt > clock()) return { outcome: project(row) }
      // Automatic execution is initial-only. Failed/unknown delivery needs an
      // explicit original-session owner retry, not webhook/confirmation loops.
      if (!owner && row.status !== "pending") return { outcome: project(row) }
      const update = async (status: TenantTrialNotification["status"], failureCode: string) => {
        await audit(tx, profile, op, status, "result")
        const changed = await tx.tenantTrialNotification.updateMany({ where: { id: row.id, userId, fencingToken: row.fencingToken,
          leaseOwner: row.leaseOwner, status: row.status }, data: { status, failureCode, failureSummary: null, leaseOwner: null, leaseExpiresAt: null } })
        if (changed.count !== 1) return fail("trial_notification_fence_lost")
        return { outcome: { status, failureCode } }
      }
      const grant = await tx.tenantTrialGrant.findUnique({ where: { userId } })
      const billingRisks = await tx.tenantBillingRisk.findMany({ where: { userId } })
      if (obsolete(op, profile, grant, resolveEffectiveAccess({ platformOwnerAccess: await readPlatformOwnerAccess(userId), profile, grant, billingRisks }, clock()), clock())) {
        return provenUnsent(row) ? update("superseded", "notification_obsolete") : update("unknown", "notification_obsolete_reconciliation_required")
      }
      if (!provenUnsent(row) && (!row.firstAttemptAt || clock().getTime() >= +row.firstAttemptAt + RETENTION)) {
        return update("unknown", "provider_reconciliation_required")
      }
      if (row.providerIdempotencyKey !== `trial-access/${op.id}`) return fail("trial_notification_evidence_invalid", 503)
      let payload: TrialAccessNotificationPayload
      if (row.renderedPayload !== null) {
        const parsed = payloadSchema.safeParse(row.renderedPayload)
        if (!parsed.success || parsed.data.to !== row.recipientEmail) return fail("trial_notification_evidence_invalid", 503)
        payload = parsed.data
      } else {
        if (!provenUnsent(row) || row.firstAttemptAt !== null) return fail("trial_notification_evidence_invalid", 503)
        let recipient: TrialAccessContact
        if (row.recipientEmail !== null) {
          if (!["stripe_billing", "owner_fallback"].includes(row.contactSource ?? "")) return fail("trial_notification_evidence_invalid", 503)
          recipient = { email: row.recipientEmail, name: row.recipientName,
            source: row.contactSource as "stripe_billing" | "owner_fallback", nameMissing: row.recipientName === null }
        } else {
          // Match 7.1: only untouched pending contact evidence may initialize.
          // A previously blocked missing contact is not silently retargeted.
          if (row.status !== "pending" || row.recipientName !== null || row.contactSource !== null) return { outcome: project(row) }
          recipient = await contact(profile)
        }
        if (!recipient.email) return update("blocked", "trial_notification_contact_unavailable")
        const frozenContact = await tx.tenantTrialNotification.updateMany({ where: { id: row.id, userId, fencingToken: row.fencingToken, status: row.status },
          data: { recipientEmail: recipient.email, recipientName: recipient.name, contactSource: recipient.source } })
        if (frozenContact.count !== 1) return fail("trial_notification_fence_lost")
        try { payload = buildTrialAccessNotification(op.result as unknown as CompletedTrialNotificationResult, recipient, dependencies?.env ?? process.env) }
        catch { return update("blocked", "trial_notification_configuration_unavailable") }
        const frozenPayload = await tx.tenantTrialNotification.updateMany({ where: { id: row.id, userId, fencingToken: row.fencingToken, status: row.status },
          data: { recipientEmail: recipient.email, recipientName: recipient.name, contactSource: recipient.source, renderedPayload: json(payload) } })
        if (frozenPayload.count !== 1) return fail("trial_notification_fence_lost")
      }
      const instant = clock(), leaseOwner = randomUUID(), fencingToken = row.fencingToken + 1
      if (owner) assertTrialAccessOwner(owner, instant)
      await audit(tx, profile, op, "sending", "attempt")
      if (owner) assertTrialAccessOwner(owner, clock())
      if (clock().getTime() >= instant.getTime() + LEASE) return fail("trial_notification_claim_expired")
      const leaseExpiresAt = new Date(+instant + LEASE)
      const changed = await tx.tenantTrialNotification.updateMany({ where: { id: row.id, userId, status: row.status,
        fencingToken: row.fencingToken, leaseOwner: row.leaseOwner }, data: { status: "sending", leaseOwner, leaseExpiresAt,
        fencingToken, attempts: { increment: 1 }, firstAttemptAt: row.firstAttemptAt ?? instant, lastAttemptAt: instant,
        failureCode: null, failureSummary: null } })
      if (changed.count !== 1) return fail("trial_notification_fence_lost")
      return { claim: { leaseOwner, fencingToken, leaseExpiresAt, firstAttemptAt: row.firstAttemptAt ?? instant,
        wasUnsent: provenUnsent(row), payload, key: row.providerIdempotencyKey } }
    })
    if (accepted.outcome) return accepted.outcome
    const claim = accepted.claim!
    // Recheck after claim COMMIT; no provider mutation runs under a transaction.
    const ready = await locked(async (tx, profile, op, row) => {
      if (!row || row.status !== "sending" || row.leaseOwner !== claim.leaseOwner || row.fencingToken !== claim.fencingToken ||
          !row.leaseExpiresAt || row.leaseExpiresAt <= clock()) return false
      const grant = await tx.tenantTrialGrant.findUnique({ where: { userId } })
      const billingRisks = await tx.tenantBillingRisk.findMany({ where: { userId } })
      return !obsolete(op, profile, grant, resolveEffectiveAccess({ platformOwnerAccess: await readPlatformOwnerAccess(userId), profile, grant, billingRisks }, clock()), clock())
    })
    if (!ready || clock() >= claim.leaseExpiresAt || (!claim.wasUnsent && +clock() >= +claim.firstAttemptAt + RETENTION)) {
      // This invocation did not send. Only a proven-unsent predecessor permits
      // definitive suppression; an interrupted/unknown predecessor stays unknown.
      return locked(async (tx, profile, op, row) => {
        if (!row || row.status !== "sending" || row.leaseOwner !== claim.leaseOwner || row.fencingToken !== claim.fencingToken ||
          !row.leaseExpiresAt || row.leaseExpiresAt <= clock()) {
          return fail("trial_notification_fence_lost")
        }
        const status = claim.wasUnsent ? "superseded" : "unknown"
        const failureCode = claim.wasUnsent ? "notification_dispatch_suppressed" : "notification_dispatch_not_confirmed"
        await audit(tx, profile, op, status, "result")
        if (row.leaseExpiresAt <= clock()) return fail("trial_notification_fence_lost")
        const changed = await tx.tenantTrialNotification.updateMany({ where: { id: row.id, userId, status: "sending",
          leaseOwner: claim.leaseOwner, fencingToken: claim.fencingToken }, data: { status, failureCode, leaseOwner: null, leaseExpiresAt: null } })
        if (changed.count !== 1) return fail("trial_notification_fence_lost")
        return { status, failureCode }
      })
    }
    let outcome: TrialNotificationSendOutcome
    try { outcome = await send(Object.freeze(claim.payload), claim.key) }
    catch { outcome = { status: "unknown", code: "provider_uncertain" } }
    // A rejection of a replay does NOT prove the previous uncertain call unsent.
    if (!claim.wasUnsent && outcome.status === "not_sent") outcome = { status: "unknown", code: "provider_uncertain" }
    const status = outcome.status === "not_sent" ? "failed" : outcome.status
    const failureCode = outcome.status === "sent" ? null : outcome.status === "not_sent" ? `unsent/${outcome.code}` : "provider_outcome_unknown"
    // No catch: mandatory audit/result persistence failures propagate. Original
    // sending lease remains durable; even a known in-memory success isn't proof
    // of a committed result. Recovery respects the ORIGINAL 24h deadline.
    return locked(async (tx, profile, op, row) => {
      if (!row || row.status !== "sending" || row.leaseOwner !== claim.leaseOwner || row.fencingToken !== claim.fencingToken ||
          !row.leaseExpiresAt || row.leaseExpiresAt <= clock()) return fail("trial_notification_fence_lost")
      await audit(tx, profile, op, status, "result")
      if (row.leaseExpiresAt <= clock()) return fail("trial_notification_fence_lost")
      const changed = await tx.tenantTrialNotification.updateMany({ where: { id: row.id, userId, status: "sending",
        leaseOwner: claim.leaseOwner, fencingToken: claim.fencingToken }, data: { status, failureCode, failureSummary: null,
        ...(outcome.status === "sent" ? { providerMessageId: outcome.messageId, sentAt: clock() } : {}), leaseOwner: null, leaseExpiresAt: null } })
      if (changed.count !== 1) return fail("trial_notification_fence_lost")
      return { status, failureCode }
    })
  }
  return { deliver, clock }
}

/** User-initiated delivery-only retry: current owner guard AND original session.
 * D1's fresh-session exception is exclusively status/Stripe recovery. */
export function createTrialAccessDeliveryService(dependencies?: TrialDeliveryDependencies & { authorize: () => Promise<AdminGuardContext> }): {
  retry(userId: string, operationId: string, request: TrialOperationRequestContext): Promise<TrialNotificationDeliveryOutcome>
} {
  const engine = deliveryEngine(dependencies)
  return { async retry(userId, operationId, request) {
    const owner = await (dependencies?.authorize ?? (() => requireAdminElevation({ minRole: "platform_owner" })))()
    assertTrialAccessOwner(owner, engine.clock())
    return engine.deliver(userId, operationId, request, owner)
  } }
}

/** Internal trusted service caller only; not exported from a route or client. */
export function createTrialAccessSystemDelivery(dependencies?: TrialDeliveryDependencies): {
  afterCommit(userId: string, operationId: string, request: TrialOperationRequestContext): Promise<TrialNotificationDeliveryOutcome>
} {
  return { afterCommit: deliveryEngine(dependencies).deliver }
}