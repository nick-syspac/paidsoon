import type { PrismaTx } from "@/lib/db/withUserContext"
import { getEffectiveAccess } from "@/lib/billing/effectiveAccessLoader"
import { readPlatformOwnerAccess, readPlatformOwnerAccessForUsers } from "@/lib/billing/platformOwnerAccess"
import {
  EFFECTIVE_ACCESS_PROFILE_SELECT,
  EFFECTIVE_ACCESS_GRANT_SELECT,
  EFFECTIVE_ACCESS_RISK_SELECT,
  type EffectiveAccessLoadOptions,
} from "@/lib/billing/effectiveAccessSnapshot"
import {
  resolveEffectiveAccess,
  type EffectiveAccess,
  type TrialGrantSnapshot,
  type BillingRiskSnapshot,
} from "@/lib/billing/effectiveAccess"
import {
  DEFAULT_SUBSCRIPTION_TIER,
  getPlanByTier,
  hasPlanFeature,
  type SubscriptionFeature,
  type SubscriptionTier,
} from "@/lib/subscriptionPlans"
import { isNearLimit } from "@/lib/dashboardUpsell"
import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client"
import type Stripe from "stripe"
import {
  retrieveSubscriptionWithLatestInvoice,
  reconcileStripeSubscription,
  stripeObjectId,
  type StripeBillingBinding,
  type VerifiedStripeSnapshot,
} from "@/lib/billing/stripeSubscriptions"

export async function getSubscriptionTier(
  userId: string,
  options: EffectiveAccessLoadOptions = {},
): Promise<SubscriptionTier | null> {
  const access = await getEffectiveAccess(userId, options)
  return access.allowAccess ? access.effectiveTier : null
}

export async function requireFeature(
  userId: string,
  feature: SubscriptionFeature,
  options: EffectiveAccessLoadOptions = {},
): Promise<boolean> {
  const tier = await getSubscriptionTier(userId, options)
  return tier !== null && hasPlanFeature(tier, feature)
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

export function getCommitmentLimitForTier(tier?: string | null): number {
  const limit = getPlanByTier(tier).limits.commitmentsTracked
  return limit === -1 ? Number.MAX_SAFE_INTEGER : limit
}

export function getCommitmentDetectionCandidateLimitForTier(tier?: string | null): number {
  const limit = getPlanByTier(tier).limits.commitmentDetectionCandidatesPerCycle
  return limit === -1 ? Number.MAX_SAFE_INTEGER : limit
}

export function getDepositGuardActiveJobsLimitForTier(tier?: string | null): number {
  const limit = getPlanByTier(tier).limits.depositGuardActiveJobs
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
  binding?: StripeBillingBinding,
): Promise<VerifiedStripeSnapshot | null> {
  const subscriptionId = stripeObjectId(session.subscription)
  if (!subscriptionId) return null
  const subscription = await retrieveSubscriptionWithLatestInvoice(stripe, subscriptionId)
  const result = reconcileStripeSubscription(subscription, {
    subscriptionId, sources: [session], binding,
  })
  return result.kind === "current" ? result.snapshot : null
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
  /** Internal server fact for pure computations; loaders overwrite it freshly. */
  platformOwnerAccess?: boolean
  subscriptionTier?: string | null
  subscriptionStatus: string
  stripeSubscriptionId?: string | null
  billingAccessVersion?: number
  /** Optional safe facts for pure computations; loaders read these freshly. */
  grant?: TrialGrantSnapshot | null
  billingRisks?: readonly BillingRiskSnapshot[]
  subscriptionCurrentPeriodStart: Date | null
  subscriptionCurrentPeriodEnd: Date | null
  trialEndsAt: Date | null
  createdAt: Date
}

/**
 * Resolves the window over which an account's chase-volume allowance usage
 * is measured. Resolution order (see design.md decision 3):
 *   1. Active billing period — `subscriptionCurrentPeriodStart/End`, when both are set.
 *   2. Trial window — account creation to `trialEndsAt`, when trialing and
 *      the synchronized trial end is still in the future.
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

  if (
    account.subscriptionStatus === "trialing" &&
    account.trialEndsAt &&
    account.trialEndsAt > now
  ) {
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
  /** False means no usable quota, even if an accounting window/usage exists. */
  accessAllowed: boolean
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
  const access = allowanceAccess(account, account.grant ?? null, account.billingRisks ?? [], now)
  const period = effectiveAllowancePeriod(account, access, now)
  const usage = firstChasedAtTimestamps.filter(
    (timestamp) => timestamp >= period.start && timestamp < period.end,
  ).length
  return effectiveAllowanceStatus(period, access, usage)
}

const ALLOWANCE_PROFILE_SELECT = {
  ...EFFECTIVE_ACCESS_PROFILE_SELECT,
  subscriptionCurrentPeriodStart: true,
  subscriptionCurrentPeriodEnd: true,
  createdAt: true,
  tenantTrialGrant: { select: EFFECTIVE_ACCESS_GRANT_SELECT },
} as const satisfies Prisma.UserProfileSelect

function allowanceAccess(
  account: AllowanceAccountSnapshot,
  grant: TrialGrantSnapshot | null,
  billingRisks: readonly BillingRiskSnapshot[],
  now: Date,
): EffectiveAccess {
  return resolveEffectiveAccess({
    platformOwnerAccess: account.platformOwnerAccess,
    profile: {
      subscriptionStatus: account.subscriptionStatus,
      subscriptionTier: account.subscriptionTier ?? null,
      stripeSubscriptionId: account.stripeSubscriptionId ?? null,
      trialEndsAt: account.trialEndsAt,
      billingAccessVersion: account.billingAccessVersion ?? 0,
    },
    grant,
    billingRisks,
  }, now)
}

function effectiveAllowancePeriod(
  account: AllowanceAccountSnapshot,
  access: EffectiveAccess,
  now: Date,
): AllowancePeriod {
  // Expiry provenance may belong to a later independent source. Only the
  // currently effective grant anchors grant accounting, never that later expiry.
  if (access.source === "admin_grant" && access.grant?.startsAt && access.grant.expiresAt) {
    return { start: access.grant.startsAt, end: access.grant.expiresAt }
  }
  return resolveAllowancePeriod(account, now)
}

function effectiveAllowanceStatus(
  period: AllowancePeriod,
  access: EffectiveAccess,
  usage: number,
): ChaseAllowanceStatus {
  const accessAllowed = access.allowAccess && access.effectiveTier !== null
  const allowance = accessAllowed ? getInvoiceLimitForTier(access.effectiveTier) : 0
  return {
    period,
    accessAllowed,
    allowance,
    usage,
    remaining: Math.max(allowance - usage, 0),
    atCapacity: usage >= allowance,
    nearLimit: accessAllowed && isNearLimit(usage, allowance),
  }
}

async function loadAllowanceUsage(
  tx: PrismaTx | PrismaClient,
  userId: string,
  account: AllowanceAccountSnapshot,
  access: EffectiveAccess,
  now: Date,
): Promise<ChaseAllowanceStatus> {
  const period = effectiveAllowancePeriod(account, access, now)
  const usage = await tx.trackedInvoice.count({
    where: { userId, firstChasedAt: { gte: period.start, lt: period.end } },
  })
  return effectiveAllowanceStatus(period, access, usage)
}

/**
 * Resolves a single account's current chase-volume allowance status.
 * Accepts either a `withUserContext` transaction client or `prismaAdmin`
 * directly. All reads use the supplied client and explicit tenant scopes;
 * grant reads select only customer-readable access facts.
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

  const risks = await tx.tenantBillingRisk.findMany({
    where: { userId },
    select: EFFECTIVE_ACCESS_RISK_SELECT,
  })
  const platformOwnerAccess = await readPlatformOwnerAccess(userId)
  const access = allowanceAccess({ ...profile, platformOwnerAccess }, profile.tenantTrialGrant, risks, now)
  return loadAllowanceUsage(tx, userId, profile, access, now)
}

export async function getChaseAllowanceStatusForAccount(
  tx: PrismaTx | PrismaClient,
  userId: string,
  account: AllowanceAccountSnapshot,
  now: Date = new Date(),
): Promise<ChaseAllowanceStatus> {
  const grant = await tx.tenantTrialGrant.findUnique({
    where: { userId },
    select: EFFECTIVE_ACCESS_GRANT_SELECT,
  })
  const risks = await tx.tenantBillingRisk.findMany({
    where: { userId },
    select: EFFECTIVE_ACCESS_RISK_SELECT,
  })
  const platformOwnerAccess = await readPlatformOwnerAccess(userId)
  return loadAllowanceUsage(tx, userId, account, allowanceAccess({ ...account, platformOwnerAccess }, grant, risks, now), now)
}

/**
 * Resolves chase-volume allowance status for many accounts in one pass
 * — four batched reads (profiles/current grants, risks, roles, first-chase timestamps),
 * never N+1. The caller supplies the authorized RLS or system client.
 */
export async function getChaseAllowanceStatusesForUsers(
  tx: PrismaTx | PrismaClient,
  userIds: string[],
  now: Date = new Date(),
): Promise<Map<string, ChaseAllowanceStatus>> {
  const statuses = new Map<string, ChaseAllowanceStatus>()
  const ids = [...new Set(userIds)]
  if (ids.length === 0) return statuses

  const profiles = await tx.userProfile.findMany({
    where: { userId: { in: ids } },
    select: { userId: true, ...ALLOWANCE_PROFILE_SELECT },
  })
  if (profiles.length === 0) return statuses

  const profileIds = profiles.map((profile) => profile.userId)
  const risks = await tx.tenantBillingRisk.findMany({
    where: { userId: { in: profileIds } },
    select: { userId: true, ...EFFECTIVE_ACCESS_RISK_SELECT },
  })
  const risksByUserId = new Map<string, BillingRiskSnapshot[]>()
  for (const { userId, ...risk } of risks) {
    const facts = risksByUserId.get(userId) ?? []
    facts.push(risk)
    risksByUserId.set(userId, facts)
  }
  const owners = await readPlatformOwnerAccessForUsers(profileIds)
  const accessByUserId = new Map(profiles.map((profile) => [profile.userId,
    allowanceAccess({ ...profile, platformOwnerAccess: owners.has(profile.userId) }, profile.tenantTrialGrant, risksByUserId.get(profile.userId) ?? [], now),
  ] as const))

  const periodsByUserId = new Map(
    profiles.map((profile) => [profile.userId,
      effectiveAllowancePeriod(profile, accessByUserId.get(profile.userId)!, now),
    ] as const),
  )
  const earliestStart = profiles.reduce<Date | null>((min, profile) => {
    const start = periodsByUserId.get(profile.userId)!.start
    return !min || start < min ? start : min
  }, null)

  const firstChases = earliestStart
    ? await tx.trackedInvoice.findMany({
        where: {
          userId: { in: profileIds },
          firstChasedAt: { gte: earliestStart },
        },
        select: { userId: true, firstChasedAt: true },
      })
    : []

  const usageByUserId = new Map<string, number>()
  for (const { userId, firstChasedAt } of firstChases) {
    const period = periodsByUserId.get(userId)
    if (period && firstChasedAt && firstChasedAt >= period.start && firstChasedAt < period.end) {
      usageByUserId.set(userId, (usageByUserId.get(userId) ?? 0) + 1)
    }
  }
  for (const profile of profiles) {
    statuses.set(profile.userId, effectiveAllowanceStatus(
      periodsByUserId.get(profile.userId)!,
      accessByUserId.get(profile.userId)!,
      usageByUserId.get(profile.userId) ?? 0,
    ))
  }

  return statuses
}
