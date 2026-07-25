import { withUserContext, type PrismaTx } from "@/lib/db/withUserContext"
import {
  DEFAULT_SUBSCRIPTION_TIER,
  getPlanByTier,
  hasPlanFeature,
  normalizeSubscriptionTier,
  type SubscriptionFeature,
  type SubscriptionTier,
} from "@/lib/subscriptionPlans"
import { isNearLimit } from "@/lib/dashboardUpsell"
import type { PrismaClient } from "@/lib/generated/prisma/client"
import type Stripe from "stripe"

export async function getSubscriptionTier(
  userId: string,
): Promise<SubscriptionTier> {
  const profile = await withUserContext(userId, (tx) =>
    tx.userProfile.findUnique({
      where: { userId },
      select: { subscriptionTier: true },
    }),
  )

  return normalizeSubscriptionTier(profile?.subscriptionTier)
}

export async function requireFeature(
  userId: string,
  feature: SubscriptionFeature,
): Promise<boolean> {
  const tier = await getSubscriptionTier(userId)
  return hasPlanFeature(tier, feature)
}

/** Returns the effective invoice limit for a tier. -1 in the plan catalog means unlimited; this returns Number.MAX_SAFE_INTEGER in that case. */
export function getInvoiceLimitForTier(tier?: string | null): number {
  const limit = getPlanByTier(tier).limits.chasedInvoicesPerMonth
  return limit === -1 ? Number.MAX_SAFE_INTEGER : limit
}

/** Returns the effective connected-invoice-source limit for a tier (Stripe
 * Connect accounts and accounting connections, combined). -1 in the plan
 * catalog means unlimited; this returns Number.MAX_SAFE_INTEGER in that case. */
export function getInvoiceSourceLimitForTier(tier?: string | null): number {
  const limit = getPlanByTier(tier).limits.connectedInvoiceSources
  return limit === -1 ? Number.MAX_SAFE_INTEGER : limit
}

/** Counts every connected invoice source for a user — active Stripe Connect
 * accounts plus non-disconnected/non-revoked accounting connections — against
 * which the one-invoice-source-per-tier limit is enforced. Accepts either a
 * `withUserContext` transaction client or `prismaAdmin` directly. */
export async function countActiveInvoiceSources(
  tx: PrismaTx | PrismaClient,
  userId: string,
): Promise<number> {
  const stripeCount = await tx.invoiceConnection.count({
    where: { userId, provider: "stripe", isActive: true },
  })
  const accountingCount = await tx.accountingConnection.count({
    where: { userId, status: { notIn: ["disconnected", "revoked"] } },
  })
  return stripeCount + accountingCount
}

export function getUserSeatLimitForTier(tier?: string | null): number {
  const limit = getPlanByTier(tier).limits.userSeats
  return limit === -1 ? Number.MAX_SAFE_INTEGER : limit
}

export const DEFAULT_INVOICE_LIMIT =
  getPlanByTier(DEFAULT_SUBSCRIPTION_TIER).limits.chasedInvoicesPerMonth

/**
 * Computes the tier, subscription ID, customer ID, and current period
 * start/end that a completed Stripe Checkout session should apply to a
 * UserProfile. Shared between the `checkout.session.completed` webhook
 * handler (app/api/webhooks/stripe-billing) and the post-checkout
 * reconciliation route (app/api/billing/checkout/success), which self-heals
 * the immediate post-payment redirect in case the webhook hasn't been
 * delivered yet — webhook delivery is async and can lag by several seconds,
 * or never arrive at all in a misconfigured/unregistered environment. The
 * webhook remains the source of truth for ongoing lifecycle events
 * (renewals, cancellations); this only covers the one-time post-checkout
 * snapshot.
 */
export async function resolveCheckoutCompletion(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
): Promise<{
  tier: SubscriptionTier
  subscriptionId: string
  customerId: string
  periodStart: Date | null
  periodEnd: Date | null
} | null> {
  if (!session.subscription) return null

  const tier = normalizeSubscriptionTier(session.metadata?.selectedTier)
  const subscriptionId = session.subscription as string
  // Fetch subscription and expand latest_invoice to get period_start/period_end
  // (current_period_start/current_period_end were removed from Subscription
  // in API 2026-05-27).
  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ["latest_invoice"],
  })
  const latestInvoice = subscription.latest_invoice as Stripe.Invoice | null
  const periodStart = latestInvoice?.period_start
    ? new Date(latestInvoice.period_start * 1000)
    : null
  const periodEnd = latestInvoice?.period_end
    ? new Date(latestInvoice.period_end * 1000)
    : null

  return {
    tier,
    subscriptionId,
    customerId: session.customer as string,
    periodStart,
    periodEnd,
  }
}

// ---------------------------------------------------------------------------
// Chase-volume entitlement
//
// The chased-invoice allowance (lib/subscriptionPlans.ts limits.chasedInvoicesPerMonth)
// is consumed once per invoice, at its first reminder send, and measured over
// the account's current billing period. See
// openspec/changes/monthly-chase-volume-limits/design.md for the full model.
// ---------------------------------------------------------------------------

const ALLOWANCE_PERIOD_TIME_ZONE = "Australia/Melbourne"

interface ZonedDateParts {
  year: number
  month: number
  day: number
}

/** Offset (ms) to add to a UTC instant to obtain the given zone's wall clock. */
function zonedOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant)

  const lookup: Record<string, string> = {}
  for (const part of parts) lookup[part.type] = part.value

  const asUtc = Date.UTC(
    Number(lookup.year),
    Number(lookup.month) - 1,
    Number(lookup.day),
    Number(lookup.hour) % 24,
    Number(lookup.minute),
    Number(lookup.second),
  )

  return asUtc - instant.getTime()
}

/** Convert a wall-clock date (midnight) in `timeZone` to the corresponding UTC instant. */
function zonedMidnightToUtc(parts: ZonedDateParts, timeZone: string): Date {
  const naive = Date.UTC(parts.year, parts.month - 1, parts.day)
  // Two-pass resolution handles DST transitions: the offset that applies is
  // the one in force at the candidate instant, not at the naive UTC instant.
  const firstPass = new Date(naive - zonedOffsetMs(new Date(naive), timeZone))
  const secondOffset = zonedOffsetMs(firstPass, timeZone)
  return new Date(naive - secondOffset)
}

/** The calendar date in `timeZone` at the given instant. */
function zonedDateParts(instant: Date, timeZone: string): ZonedDateParts {
  const offset = zonedOffsetMs(instant, timeZone)
  const shifted = new Date(instant.getTime() + offset)
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  }
}

export interface AllowancePeriod {
  start: Date
  /** Exclusive end of the period. */
  end: Date
}

/** The subset of UserProfile fields needed to resolve an account's current allowance period. */
export interface AllowanceAccountSnapshot {
  subscriptionTier?: string | null
  subscriptionStatus: string
  subscriptionCurrentPeriodStart: Date | null
  subscriptionCurrentPeriodEnd: Date | null
  trialEndsAt: Date | null
  createdAt: Date
}

/**
 * Resolves the window over which an account's chase-volume allowance usage
 * is measured. Resolution order (see design.md decision 3):
 *   1. Active billing period — `subscriptionCurrentPeriodStart/End`, when both are set.
 *   2. Trial window — account creation to `trialEndsAt`, when trialing.
 *   3. Fallback — the current calendar month in Australia/Melbourne.
 */
export function resolveAllowancePeriod(
  account: AllowanceAccountSnapshot,
  now: Date = new Date(),
): AllowancePeriod {
  if (account.subscriptionCurrentPeriodStart && account.subscriptionCurrentPeriodEnd) {
    return {
      start: account.subscriptionCurrentPeriodStart,
      end: account.subscriptionCurrentPeriodEnd,
    }
  }

  if (account.subscriptionStatus === "trialing" && account.trialEndsAt) {
    return { start: account.createdAt, end: account.trialEndsAt }
  }

  const { year, month } = zonedDateParts(now, ALLOWANCE_PERIOD_TIME_ZONE)
  const start = zonedMidnightToUtc({ year, month, day: 1 }, ALLOWANCE_PERIOD_TIME_ZONE)
  const nextMonth = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 }
  const end = zonedMidnightToUtc(
    { year: nextMonth.year, month: nextMonth.month, day: 1 },
    ALLOWANCE_PERIOD_TIME_ZONE,
  )
  return { start, end }
}

export interface ChaseAllowanceStatus {
  period: AllowancePeriod
  /** Invoices that may enter follow-up in the current period. */
  allowance: number
  /** Invoices that have already consumed allowance this period. */
  usage: number
  /** `allowance - usage`, floored at 0. */
  remaining: number
  atCapacity: boolean
  /** True at or above the shared near-limit threshold (lib/dashboardUpsell.ts). */
  nearLimit: boolean
}

/**
 * Pure computation of allowance status given an account snapshot and the
 * `firstChasedAt` timestamps of its invoices (any subset is fine — only
 * timestamps falling inside the resolved period are counted).
 */
export function computeChaseAllowanceStatus(
  account: AllowanceAccountSnapshot,
  firstChasedAtTimestamps: Date[],
  now: Date = new Date(),
): ChaseAllowanceStatus {
  const period = resolveAllowancePeriod(account, now)
  const allowance = getInvoiceLimitForTier(account.subscriptionTier)
  const usage = firstChasedAtTimestamps.filter(
    (timestamp) => timestamp >= period.start && timestamp < period.end,
  ).length
  const remaining = Math.max(allowance - usage, 0)
  return {
    period,
    allowance,
    usage,
    remaining,
    atCapacity: usage >= allowance,
    nearLimit: isNearLimit(usage, allowance),
  }
}

const ALLOWANCE_PROFILE_SELECT = {
  subscriptionTier: true,
  subscriptionStatus: true,
  subscriptionCurrentPeriodStart: true,
  subscriptionCurrentPeriodEnd: true,
  trialEndsAt: true,
  createdAt: true,
} as const

/**
 * Resolves a single account's current chase-volume allowance status.
 * Accepts either a `withUserContext` transaction client or `prismaAdmin`
 * directly (task 2.4) — issues one profile lookup and one count query,
 * sequentially.
 */
export async function getChaseAllowanceStatus(
  tx: PrismaTx | PrismaClient,
  userId: string,
  now: Date = new Date(),
): Promise<ChaseAllowanceStatus | null> {
  const profile = await tx.userProfile.findUnique({
    where: { userId },
    select: ALLOWANCE_PROFILE_SELECT,
  })
  if (!profile) return null

  const period = resolveAllowancePeriod(profile, now)
  const usage = await tx.trackedInvoice.count({
    where: { userId, firstChasedAt: { gte: period.start, lt: period.end } },
  })
  const allowance = getInvoiceLimitForTier(profile.subscriptionTier)
  return {
    period,
    allowance,
    usage,
    remaining: Math.max(allowance - usage, 0),
    atCapacity: usage >= allowance,
    nearLimit: isNearLimit(usage, allowance),
  }
}

/**
 * Resolves chase-volume allowance status for many accounts in one pass
 * (task 3.1) — one batched profile query and one batched `firstChasedAt`
 * query, rather than two queries per account.
 */
export async function getChaseAllowanceStatusesForUsers(
  tx: PrismaTx | PrismaClient,
  userIds: string[],
  now: Date = new Date(),
): Promise<Map<string, ChaseAllowanceStatus>> {
  const statuses = new Map<string, ChaseAllowanceStatus>()
  if (userIds.length === 0) return statuses

  const profiles = await tx.userProfile.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true, ...ALLOWANCE_PROFILE_SELECT },
  })

  const periodsByUserId = new Map(
    profiles.map((profile) => [profile.userId, resolveAllowancePeriod(profile, now)] as const),
  )
  const earliestStart = profiles.reduce<Date | null>((min, profile) => {
    const start = periodsByUserId.get(profile.userId)!.start
    return !min || start < min ? start : min
  }, null)

  const firstChases = earliestStart
    ? await tx.trackedInvoice.findMany({
        where: {
          userId: { in: profiles.map((profile) => profile.userId) },
          firstChasedAt: { gte: earliestStart },
        },
        select: { userId: true, firstChasedAt: true },
      })
    : []

  for (const profile of profiles) {
    const timestamps = firstChases
      .filter((row) => row.userId === profile.userId && row.firstChasedAt)
      .map((row) => row.firstChasedAt as Date)
    statuses.set(profile.userId, computeChaseAllowanceStatus(profile, timestamps, now))
  }

  return statuses
}
