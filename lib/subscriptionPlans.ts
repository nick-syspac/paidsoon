export type SubscriptionTier = "starter" | "solo" | "small_business"

export type SubscriptionFeature =
  | "basic_email_reminders"
  | "email_reminder_sequence"
  | "basic_templates"
  | "custom_reminder_templates"
  | "paid_soon_branding"
  | "own_email_address"
  | "ai_rewrite"
  | "tone_settings"
  | "payment_status_dashboard"
  | "overdue_invoice_dashboard"

export interface PlanLimits {
  chasedInvoicesPerMonth: number
  userSeats: number
  connectedStripeAccounts: number
}

export interface PlanDefinition {
  id: SubscriptionTier
  name: string
  monthlyPriceUsd: number
  limits: PlanLimits
  features: Record<SubscriptionFeature, boolean>
}

export const DEFAULT_SUBSCRIPTION_TIER: SubscriptionTier = "starter"

const LEGACY_TIER_MAP: Record<string, SubscriptionTier> = {
  free: "starter",
  pro: "solo",
}

export const PLAN_CATALOG: Record<SubscriptionTier, PlanDefinition> = {
  starter: {
    id: "starter",
    name: "Starter",
    monthlyPriceUsd: 9,
    limits: {
      chasedInvoicesPerMonth: 10,
      userSeats: 1,
      connectedStripeAccounts: 1,
    },
    features: {
      basic_email_reminders: true,
      email_reminder_sequence: false,
      basic_templates: false,
      custom_reminder_templates: false,
      paid_soon_branding: true,
      own_email_address: false,
      ai_rewrite: false,
      tone_settings: false,
      payment_status_dashboard: false,
      overdue_invoice_dashboard: false,
    },
  },
  solo: {
    id: "solo",
    name: "Solo",
    monthlyPriceUsd: 19,
    limits: {
      chasedInvoicesPerMonth: 30,
      userSeats: 1,
      connectedStripeAccounts: 1,
    },
    features: {
      basic_email_reminders: true,
      email_reminder_sequence: true,
      basic_templates: true,
      custom_reminder_templates: false,
      paid_soon_branding: true,
      own_email_address: true,
      ai_rewrite: false,
      tone_settings: false,
      payment_status_dashboard: true,
      overdue_invoice_dashboard: true,
    },
  },
  small_business: {
    id: "small_business",
    name: "Small Business",
    monthlyPriceUsd: 39,
    limits: {
      chasedInvoicesPerMonth: 100,
      userSeats: 3,
      connectedStripeAccounts: 3,
    },
    features: {
      basic_email_reminders: true,
      email_reminder_sequence: true,
      basic_templates: true,
      custom_reminder_templates: true,
      paid_soon_branding: true,
      own_email_address: true,
      ai_rewrite: true,
      tone_settings: true,
      payment_status_dashboard: true,
      overdue_invoice_dashboard: true,
    },
  },
}

export const PLAN_ORDER: SubscriptionTier[] = [
  "starter",
  "solo",
  "small_business",
]

export function normalizeSubscriptionTier(tier?: string | null): SubscriptionTier {
  if (!tier) return DEFAULT_SUBSCRIPTION_TIER
  if (tier in PLAN_CATALOG) return tier as SubscriptionTier
  if (tier in LEGACY_TIER_MAP) return LEGACY_TIER_MAP[tier]
  return DEFAULT_SUBSCRIPTION_TIER
}

export function getPlanByTier(tier?: string | null): PlanDefinition {
  return PLAN_CATALOG[normalizeSubscriptionTier(tier)]
}

export function hasPlanFeature(
  tier: string | null | undefined,
  feature: SubscriptionFeature,
): boolean {
  return getPlanByTier(tier).features[feature]
}