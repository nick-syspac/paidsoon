export type SubscriptionTier = "starter" | "business" | "accountant_partner"

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
  | "accounting_integrations"
  | "promise_to_pay_tracking"  // planned — not yet implemented
  | "weekly_summary_email"     // planned — not yet implemented
  | "multi_client_management"  // planned — not yet implemented (Accountant Partner)

export interface PlanLimits {
  /** Invoices that can be actively tracked per month. -1 = unlimited. */
  chasedInvoicesPerMonth: number
  /** User seats on the account. -1 = unlimited. */
  userSeats: number
  /** Connected Stripe accounts. -1 = unlimited. */
  connectedStripeAccounts: number
}

export interface PlanDefinition {
  id: SubscriptionTier
  name: string
  /** AUD/month. null = contact-us pricing (no Stripe Checkout). */
  monthlyPriceAud: number | null
  limits: PlanLimits
  features: Record<SubscriptionFeature, boolean>
}

export const DEFAULT_SUBSCRIPTION_TIER: SubscriptionTier = "starter"

const LEGACY_TIER_MAP: Record<string, SubscriptionTier> = {
  free: "starter",
  pro: "starter",
  solo: "starter",
  small_business: "business",
}

export const PLAN_CATALOG: Record<SubscriptionTier, PlanDefinition> = {
  starter: {
    id: "starter",
    name: "Starter",
    monthlyPriceAud: 19,
    limits: {
      chasedInvoicesPerMonth: 20,
      userSeats: 1,
      connectedStripeAccounts: 1,
    },
    features: {
      basic_email_reminders: true,
      email_reminder_sequence: true,
      basic_templates: true,
      custom_reminder_templates: false,
      paid_soon_branding: true,
      own_email_address: false,
      ai_rewrite: false,
      tone_settings: false,
      payment_status_dashboard: true,
      overdue_invoice_dashboard: true,
      accounting_integrations: false,
      promise_to_pay_tracking: false,
      weekly_summary_email: false,
      multi_client_management: false,
    },
  },
  business: {
    id: "business",
    name: "Business",
    monthlyPriceAud: 49,
    limits: {
      chasedInvoicesPerMonth: 100,
      userSeats: 1,
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
      accounting_integrations: true,
      promise_to_pay_tracking: true,
      weekly_summary_email: false,     // not yet implemented
      multi_client_management: false,
    },
  },
  accountant_partner: {
    id: "accountant_partner",
    name: "Accountant Partner",
    monthlyPriceAud: null,  // contact-us pricing; no Stripe Checkout
    limits: {
      chasedInvoicesPerMonth: -1,  // unlimited
      userSeats: -1,               // unlimited
      connectedStripeAccounts: -1, // unlimited
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
      accounting_integrations: true,
      promise_to_pay_tracking: true,
      weekly_summary_email: false,     // not yet implemented
      multi_client_management: false,  // not yet implemented
    },
  },
}

export const PLAN_ORDER: SubscriptionTier[] = [
  "starter",
  "business",
  "accountant_partner",
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