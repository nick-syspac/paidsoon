import { getPlanByTier, normalizeSubscriptionTier, type SubscriptionTier } from "@/lib/subscriptionPlans"
import { resolveAllowancePeriod, type AllowanceAccountSnapshot } from "@/lib/billing"
import type { PrismaTx } from "@/lib/db/withUserContext"
import type { PrismaClient } from "@/lib/generated/prisma/client"

export const AI_USAGE_LIMIT_ERROR = "Usage limit reached"

export interface AiRewriteGuardrailPolicy {
  monthlyQuota: number
  hourlyCap: number
  burstCap: number
}

export interface AiRewriteUsageCounts {
  monthly: number
  hourly: number
  burst: number
}

export interface AiRewriteGuardrailStatus {
  allowed: boolean
  reason: "monthly" | "hourly" | "burst" | null
  monthlyQuota: number
  remainingMonthlyCredits: number
  usage: AiRewriteUsageCounts
  period: {
    start: Date
    end: Date
  }
}

export interface AiRewriteAccountSnapshot extends AllowanceAccountSnapshot {
  subscriptionTier?: string | null
}

type AiUsageLogCountClient = {
  aiUsageLog: {
    count: (args: {
      where: {
        userId: string
        feature: string
        createdAt: {
          gte: Date
          lt?: Date
        }
      }
    }) => Promise<number>
  }
}

const AI_REWRITE_POLICY_BY_TIER: Record<SubscriptionTier, AiRewriteGuardrailPolicy | null> = {
  starter: null,
  solo: { monthlyQuota: 120, hourlyCap: 12, burstCap: 3 },
  small_business: { monthlyQuota: 500, hourlyCap: 20, burstCap: 5 },
  accountant_partner: { monthlyQuota: 1500, hourlyCap: 40, burstCap: 8 },
}

export function getAiRewriteGuardrailPolicy(
  tier: SubscriptionTier,
): AiRewriteGuardrailPolicy | null {
  return AI_REWRITE_POLICY_BY_TIER[tier]
}

export function evaluateAiRewriteGuardrails(
  policy: AiRewriteGuardrailPolicy,
  usage: AiRewriteUsageCounts,
): {
  allowed: boolean
  reason: "monthly" | "hourly" | "burst" | null
  remainingMonthlyCredits: number
} {
  const remainingMonthlyCredits = Math.max(policy.monthlyQuota - usage.monthly, 0)

  if (usage.monthly >= policy.monthlyQuota) {
    return { allowed: false, reason: "monthly", remainingMonthlyCredits }
  }
  if (usage.hourly >= policy.hourlyCap) {
    return { allowed: false, reason: "hourly", remainingMonthlyCredits }
  }
  if (usage.burst >= policy.burstCap) {
    return { allowed: false, reason: "burst", remainingMonthlyCredits }
  }

  return { allowed: true, reason: null, remainingMonthlyCredits }
}

export function resolveAiRewriteQuotaWindow(
  account: AiRewriteAccountSnapshot,
  now: Date,
): { start: Date; end: Date } {
  return resolveAllowancePeriod(account, now)
}

export async function countAiRewriteUsageWindows(
  tx: AiUsageLogCountClient,
  userId: string,
  account: AiRewriteAccountSnapshot,
  now: Date,
): Promise<{
  usage: AiRewriteUsageCounts
  period: { start: Date; end: Date }
}> {
  const period = resolveAiRewriteQuotaWindow(account, now)
  const hourStart = new Date(now.getTime() - 60 * 60 * 1000)
  const burstStart = new Date(now.getTime() - 60 * 1000)

  const [monthly, hourly, burst] = await Promise.all([
    tx.aiUsageLog.count({
      where: {
        userId,
        feature: "ai_rewrite",
        createdAt: { gte: period.start, lt: period.end },
      },
    }),
    tx.aiUsageLog.count({
      where: {
        userId,
        feature: "ai_rewrite",
        createdAt: { gte: hourStart },
      },
    }),
    tx.aiUsageLog.count({
      where: {
        userId,
        feature: "ai_rewrite",
        createdAt: { gte: burstStart },
      },
    }),
  ])

  return {
    usage: { monthly, hourly, burst },
    period,
  }
}

export async function getAiRewriteGuardrailStatus(
  userId: string,
  now: Date = new Date(),
): Promise<AiRewriteGuardrailStatus | null> {
  const { withUserContext } = await import("@/lib/db/withUserContext")

  return withUserContext(userId, async (tx) => {
    const account = await tx.userProfile.findUnique({
      where: { userId },
      select: {
        subscriptionTier: true,
        subscriptionStatus: true,
        subscriptionCurrentPeriodStart: true,
        subscriptionCurrentPeriodEnd: true,
        trialEndsAt: true,
        createdAt: true,
      },
    })

    if (!account) return null

    const tier = normalizeSubscriptionTier(account.subscriptionTier)
    if (!getPlanByTier(tier).features.ai_rewrite) {
      return null
    }

    const policy = getAiRewriteGuardrailPolicy(tier)
    if (!policy) return null

    const { usage, period } = await countAiRewriteUsageWindows(tx, userId, account, now)
    const decision = evaluateAiRewriteGuardrails(policy, usage)

    return {
      allowed: decision.allowed,
      reason: decision.reason,
      monthlyQuota: policy.monthlyQuota,
      remainingMonthlyCredits: decision.remainingMonthlyCredits,
      usage,
      period,
    }
  })
}
