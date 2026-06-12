import { PLAN_CATALOG, type SubscriptionTier } from "@/lib/subscriptionPlans"

export type UpsellFeatureIntent =
  | "templates"
  | "ai_rewrite"
  | "tone_settings"
  | "team_seats"
  | "stripe_accounts"

export interface LockedPreviewSampleRow {
  clientName: string
  amountUsd: number
  overdueDays: number
  stageLabel: string
  nextActionLabel: string
}

export interface DashboardUpsellModel {
  badgeLabel: string
  title: string
  description: string
  sampleRows: LockedPreviewSampleRow[]
  recommendedTier: SubscriptionTier | null
  ctaLabel: string
  ctaHref: string
  nearLimit: boolean
}

export const DEFAULT_NEAR_LIMIT_THRESHOLD = 0.8

export const LOCKED_DASHBOARD_SAMPLE_ROWS: LockedPreviewSampleRow[] = [
  {
    clientName: "Acme Studio",
    amountUsd: 1240,
    overdueDays: 14,
    stageLabel: "Email 2 sent",
    nextActionLabel: "Final notice in 3 days",
  },
  {
    clientName: "Northline Co",
    amountUsd: 680,
    overdueDays: 9,
    stageLabel: "Queued",
    nextActionLabel: "Friendly reminder tomorrow",
  },
  {
    clientName: "Blue Pine Ltd",
    amountUsd: 2150,
    overdueDays: 22,
    stageLabel: "Final notice",
    nextActionLabel: "Escalation recommended",
  },
]

const FEATURE_INTENT_SET = new Set<UpsellFeatureIntent>([
  "templates",
  "ai_rewrite",
  "tone_settings",
  "team_seats",
  "stripe_accounts",
])

export function getNextTierRecommendation(
  tier: SubscriptionTier,
): SubscriptionTier | null {
  if (tier === "starter") return "solo"
  if (tier === "solo") return "small_business"
  return null
}

export function isNearLimit(
  usage: number,
  limit: number,
  threshold: number = DEFAULT_NEAR_LIMIT_THRESHOLD,
): boolean {
  if (limit <= 0) return false
  return usage / limit >= threshold
}

export function hasFeatureIntentSignal(intent?: string | null): boolean {
  if (!intent) return false
  return FEATURE_INTENT_SET.has(intent as UpsellFeatureIntent)
}

export function buildDashboardUpsellModel({
  tier,
  usageCount,
  usageLimit,
  featureIntent,
  showResolved,
}: {
  tier: SubscriptionTier
  usageCount: number
  usageLimit: number
  featureIntent?: string | null
  showResolved: boolean
}): DashboardUpsellModel {
  const nextTier = getNextTierRecommendation(tier)
  const nearLimit =
    isNearLimit(usageCount, usageLimit) || hasFeatureIntentSignal(featureIntent)

  const title = showResolved
    ? "Payment status dashboard preview"
    : "Overdue invoice dashboard preview"

  const baseDescription = showResolved
    ? "See which reminders were successful, what got paid, and where follow-up needs attention."
    : "Track who is overdue, what stage each reminder is in, and what to prioritize next."

  const nearLimitDescription = nearLimit
    ? `You are close to your ${PLAN_CATALOG[tier].name} capacity (${usageCount}/${usageLimit}).`
    : "Sample rows are shown until your plan unlocks this module."

  if (!nextTier) {
    return {
      badgeLabel: "Sample preview",
      title,
      description: `${baseDescription} ${nearLimitDescription}`,
      sampleRows: LOCKED_DASHBOARD_SAMPLE_ROWS,
      recommendedTier: null,
      ctaLabel: "Manage subscription",
      ctaHref: "/dashboard/settings/subscription",
      nearLimit,
    }
  }

  const recommendedPlan = PLAN_CATALOG[nextTier]

  return {
    badgeLabel: "Sample preview",
    title,
    description: `${baseDescription} ${nearLimitDescription}`,
    sampleRows: LOCKED_DASHBOARD_SAMPLE_ROWS,
    recommendedTier: nextTier,
    ctaLabel: `Upgrade to ${recommendedPlan.name} — $${recommendedPlan.monthlyPriceUsd}/mo`,
    ctaHref: `/dashboard/settings/subscription?recommend=${nextTier}`,
    nearLimit,
  }
}
