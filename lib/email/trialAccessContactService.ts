import "server-only"
import { createClient } from "@supabase/supabase-js"
import type Stripe from "stripe"
import { z } from "zod"
import { requireAdminElevation, type AdminGuardContext } from "@/lib/admin/guard"
import { assertTrialAccessOwner, TrialPreviewError } from "@/lib/billing/trialAccessPreview"
import { createStripeClient } from "@/lib/billing/stripeClient"
import { lockTenantBilling } from "@/lib/billing/tenantBillingLock"
import { getPublicSupabaseEnvironment } from "@/lib/config/supabaseEnvironmentRuntime"
import { prismaAdmin } from "@/lib/db/admin"
import { Prisma, type TenantTrialNotification } from "@/lib/generated/prisma/client"
import {
  emptyTrialContact, resolveTrialAccessContact, trialContactEmail,
  type TrialAccessContact, type TrialContactOwner,
} from "@/lib/email/trialAccessContact"

type Transaction = <T>(run: (tx: Prisma.TransactionClient) => Promise<T>) => Promise<T>
export interface TrialNotificationContactResult {
  outcome: "frozen" | "unchanged"
  status: TenantTrialNotification["status"]
  contact: TrialAccessContact
  failureCode: string | null
}

const unavailable = (): never => { throw new TrialPreviewError("trial_contact_unavailable", 503) }
const notFound = (): never => { throw new TrialPreviewError("trial_notification_not_found", 404) }

/** Same auth-admin lookup as fetchTenantSnapshot, without loading invoices,
 * settings, metadata or sign-in history. Never expose the auth user/client. */
export async function readTrialAccessOwnerContact(userId: string): Promise<TrialContactOwner | null> {
  if (!process.env.SUPABASE_SECRET_KEY) return null
  const client = createClient(getPublicSupabaseEnvironment().publicUrl, process.env.SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data, error } = await client.auth.admin.getUserById(userId)
  if (error || !data.user) return null
  return { id: data.user.id, email: data.user.email,
    deleted_at: "deleted_at" in data.user && typeof data.user.deleted_at === "string" ? data.user.deleted_at : null }
}

function project(row: TenantTrialNotification, outcome: TrialNotificationContactResult["outcome"]): TrialNotificationContactResult {
  let contact = emptyTrialContact()
  if (row.recipientEmail !== null) {
    // Corrupt/legacy stored evidence must not trigger a new recipient lookup.
    if (!trialContactEmail(row.recipientEmail) || !["stripe_billing", "owner_fallback"].includes(row.contactSource ?? "")) {
      return unavailable()
    }
    contact = { email: row.recipientEmail, name: row.recipientName,
      source: row.contactSource as "stripe_billing" | "owner_fallback", nameMissing: row.recipientName === null }
  }
  return { outcome, status: row.status, contact, failureCode: row.failureCode }
}

/** Privileged owner-only notification exception. All reads are tenant-scoped;
 * only recipient fields or a blocked delivery outcome can change. No access,
 * operation, audit, payload, provider key, attempt or send mutation occurs here.
 * Route authorization/same-origin, rendering and delivery claims belong to later
 * tasks. Original-session notification authority is deliberately not recovery's
 * relaxed same-actor/new-session rule. */
export function createTrialAccessContactService(dependencies?: {
  transaction: Transaction
  authorize: () => Promise<AdminGuardContext>
  now: () => Date
  stripe: () => Stripe
  owner: (userId: string) => Promise<TrialContactOwner | null>
}): {
  resolve(userId: string): Promise<TrialAccessContact>
  freeze(userId: string, operationId: string): Promise<TrialNotificationContactResult>
} {
  const transaction: Transaction = dependencies?.transaction ?? ((run) => prismaAdmin.$transaction(run, { timeout: 20000 }))
  const authorize = dependencies?.authorize ?? (() => requireAdminElevation({ minRole: "platform_owner" }))
  const stripe = dependencies?.stripe ?? (() => createStripeClient({ maxNetworkRetries: 0 }))
  const ownerReader = dependencies?.owner ?? readTrialAccessOwnerContact
  function assertOwner(owner: AdminGuardContext): void {
    const now = new Date(dependencies?.now() ?? new Date())
    if (!Number.isFinite(+now)) return unavailable()
    assertTrialAccessOwner(owner, now)
  }
  async function scoped<T>(userId: string, run: (tx: Prisma.TransactionClient, owner: AdminGuardContext) => Promise<T>): Promise<T> {
    const owner = await authorize()
    assertOwner(owner)
    userId = z.string().trim().min(1).parse(userId)
    try {
      return await transaction(async (tx) => {
        await lockTenantBilling(tx, userId)
        assertOwner(owner)
        return run(tx, owner)
      })
    } catch (error) {
      if (error instanceof TrialPreviewError || error instanceof z.ZodError) throw error
      return unavailable()
    }
  }
  async function fresh(tx: Prisma.TransactionClient, userId: string): Promise<TrialAccessContact> {
    const profile = await tx.userProfile.findUnique({ where: { userId }, select: { userId: true, stripeCustomerId: true } })
    if (!profile || profile.userId !== userId) return notFound()
    return resolveTrialAccessContact(profile, {
      customer: async (id) => {
        // Platform billing only, no Connect options or raw provider response.
        const customer = await stripe().customers.retrieve(id)
        return customer.deleted ? { id: customer.id, deleted: true }
          : { id: customer.id, email: customer.email, name: customer.name, metadata: customer.metadata }
      },
      owner: ownerReader,
    })
  }
  async function resolve(userId: string): Promise<TrialAccessContact> {
    const tenant = z.string().trim().min(1).parse(userId)
    return scoped(tenant, async (tx, owner) => {
      const contact = await fresh(tx, tenant)
      assertOwner(owner)
      return contact
    })
  }
  async function freeze(userId: string, operationId: string): Promise<TrialNotificationContactResult> {
    return scoped(userId, async (tx, owner) => {
      const tenant = z.string().trim().min(1).parse(userId)
      const id = z.uuid().parse(operationId).toLowerCase()
      const scope = { userId: tenant, operationId: id, operation: {
        userId: tenant, actorUserId: owner.userId, adminSessionId: owner.adminSession.id, status: "succeeded" as const, notify: true,
      } }
      const row = await tx.tenantTrialNotification.findFirst({ where: scope })
      if (!row) return notFound()
      // Retry MUST NOT re-resolve even if email/binding changed. An untouched
      // pending outbox is the sole recipient-initialization state.
      if (row.recipientEmail !== null || row.recipientName !== null || row.contactSource !== null ||
          row.status !== "pending" || row.attempts !== 0 || row.firstAttemptAt !== null || row.lastAttemptAt !== null ||
          row.sentAt !== null || row.providerMessageId !== null || row.renderedPayload !== null ||
          row.leaseOwner !== null || row.leaseExpiresAt !== null || row.fencingToken !== 0) return project(row, "unchanged")
      const contact = await fresh(tx, tenant)
      assertOwner(owner)
      const data = contact.email ? { recipientEmail: contact.email, recipientName: contact.name, contactSource: contact.source }
        : { status: "blocked" as const, failureCode: "trial_notification_contact_unavailable",
          failureSummary: "No billing or owner contact is available." }
      const changed = await tx.tenantTrialNotification.updateMany({ where: {
        ...scope, id: row.id, status: "pending", recipientEmail: null, recipientName: null, contactSource: null,
        attempts: 0, firstAttemptAt: null, lastAttemptAt: null, sentAt: null, providerMessageId: null,
        renderedPayload: { equals: Prisma.DbNull }, leaseOwner: null, leaseExpiresAt: null, fencingToken: 0,
      }, data })
      // Re-read after CAS: another initializer/claim/supersession may have won.
      // Never return this invocation's uncommitted candidate as the recipient.
      const stored = await tx.tenantTrialNotification.findFirst({ where: scope })
      if (!stored) return notFound()
      return project(stored, changed.count === 1 ? "frozen" : "unchanged")
    })
  }
  return { resolve, freeze }
}