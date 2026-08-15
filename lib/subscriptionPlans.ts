export type SubscriptionTier =
  | "starter"
  | "solo"
  | "small_business"
  | "accountant_partner"

/** Where a tier may be surfaced. Contact-only tiers are resolvable by identifier
 * (support, admin) but MUST NOT appear in customer-facing plan listings, plan
 * pickers, or upgrade recommendations. */
export type PlanVisibility = "public" | "contact_only"

export type SubscriptionFeature =
  | "basic_email_reminders"
  | "email_reminder_sequence" // custom timing of the reminder sequence
  | "customer_specific_sequences" // NOT IMPLEMENTED — per customer-group sequences
  | "basic_templates" // business name, signature, payment details only
  | "custom_reminder_templates" // fully editable template body
  | "multi_template_customer_wording" // NOT IMPLEMENTED — multiple templates + per-customer wording
  | "paid_soon_branding"
  | "custom_reply_to"
  | "custom_sender_name"
  | "verified_from_domain"
  | "ai_rewrite"
  | "tone_settings"
  | "payment_status_dashboard"
  | "overdue_invoice_dashboard"
  | "accounting_integrations"
  | "promise_to_pay_tracking"
  | "dispute_pause"
  | "weekly_summary_email"
  | "csv_export" // NOT IMPLEMENTED
  | "approval_mode" // NOT IMPLEMENTED
  | "contact_suppression" // NOT IMPLEMENTED — do-not-contact / suppression list
  | "team_seats" // NOT IMPLEMENTED — usable multi-user seats beyond 1
  | "multi_client_management" // planned — not yet implemented (Accountant Partner)

/**
 * Features that are gated in the catalog by their intended tier boundary but are
 * not yet implemented in the product. Presentation code MUST render these as
 * "Coming soon" rather than as an included capability, regardless of which
 * tiers the catalog marks `true` for them — see repository policy against
 * presenting planned integrations as implemented ones.
 */
export const UNIMPLEMENTED_FEATURES: SubscriptionFeature[] = [
  "customer_specific_sequences",
  "multi_template_customer_wording",
  "csv_export",
  "approval_mode",
  "contact_suppression",
  "team_seats",
  "multi_client_management",
]

export function isFeatureImplemented(feature: SubscriptionFeature): boolean {
  return !UNIMPLEMENTED_FEATURES.includes(feature)
}

export interface PlanLimits {
  /** Invoices that can enter follow-up per billing period. -1 = unlimited.
   * Enforcement semantics (when this is consumed, how it resets) are defined
   * by the chase-volume-entitlement capability, not by this catalog. */
  chasedInvoicesPerMonth: number
  /** User seats on the account. -1 = unlimited. Seats beyond 1 are not yet
   * usable — see the `team_seats` feature flag. */
  userSeats: number
  /** Connected invoice sources (Stripe Connect accounts and accounting
   * connections, combined). -1 = unlimited. */
  connectedInvoiceSources: number
}

export interface PlanDefinition {
  id: SubscriptionTier
  name: string
  /** AUD/month, inclusive of GST. null = contact-us pricing (no Stripe Checkout). */
  monthlyPriceAud: number | null
  visibility: PlanVisibility
  /** Highlighted as the recommended plan on the pricing page. At most one plan should be true. */
  popular?: boolean
  /** Short marketing phrase shown under the plan name. */
  tagline: string
  limits: PlanLimits
  features: Record<SubscriptionFeature, boolean>
}

export const DEFAULT_SUBSCRIPTION_TIER: SubscriptionTier = "starter"

export const PLAN_CATALOG: Record<SubscriptionTier, PlanDefinition> = {
  starter: {
    id: "starter",
    name: "Starter",
    monthlyPriceAud: 9,
    visibility: "public",
    tagline: "For side hustlers and occasional invoicers.",
    limits: {
      chasedInvoicesPerMonth: 10,
      userSeats: 1,
      connectedInvoiceSources: 1,
    },
    features: {
      basic_email_reminders: true,
      email_reminder_sequence: false,
      customer_specific_sequences: false,
      basic_templates: true,
      custom_reminder_templates: false,
      multi_template_customer_wording: false,
      paid_soon_branding: true,
      custom_reply_to: true,
      custom_sender_name: false,
      verified_from_domain: false,
      ai_rewrite: false,
      tone_settings: false,
      payment_status_dashboard: true,
      overdue_invoice_dashboard: true,
      accounting_integrations: true,
      promise_to_pay_tracking: true,
      dispute_pause: true,
      weekly_summary_email: false,
      csv_export: false,
      approval_mode: false,
      contact_suppression: false,
      team_seats: false,
      multi_client_management: false,
    },
  },
  solo: {
    id: "solo",
    name: "Solo",
    monthlyPriceAud: 19,
    visibility: "public",
    popular: true,
    tagline: "For full-time sole traders and freelancers.",
    limits: {
      chasedInvoicesPerMonth: 50,
      userSeats: 1,
      connectedInvoiceSources: 1,
    },
    features: {
      basic_email_reminders: true,
      email_reminder_sequence: true,
      customer_specific_sequences: false,
      basic_templates: true,
      custom_reminder_templates: true,
      multi_template_customer_wording: false,
      paid_soon_branding: true,
      custom_reply_to: true,
      custom_sender_name: true,
      verified_from_domain: false,
      ai_rewrite: true,
      tone_settings: true,
      payment_status_dashboard: true,
      overdue_invoice_dashboard: true,
      accounting_integrations: true,
      promise_to_pay_tracking: true,
      dispute_pause: true,
      weekly_summary_email: false,
      csv_export: false,
      approval_mode: false,
      contact_suppression: false,
      team_seats: false,
      multi_client_management: false,
    },
  },
  small_business: {
    id: "small_business",
    name: "Small Business",
    monthlyPriceAud: 39,
    visibility: "public",
    tagline: "For small businesses with an admin/accounts team.",
    limits: {
      chasedInvoicesPerMonth: 200,
      userSeats: 3,
      connectedInvoiceSources: 1,
    },
    features: {
      basic_email_reminders: true,
      email_reminder_sequence: true,
      customer_specific_sequences: true,
      basic_templates: true,
      custom_reminder_templates: true,
      multi_template_customer_wording: true,
      paid_soon_branding: true,
      custom_reply_to: true,
      custom_sender_name: true,
      verified_from_domain: true,
      ai_rewrite: true,
      tone_settings: true,
      payment_status_dashboard: true,
      overdue_invoice_dashboard: true,
      accounting_integrations: true,
      promise_to_pay_tracking: true,
      dispute_pause: true,
      weekly_summary_email: true,
      csv_export: true,
      approval_mode: true,
      contact_suppression: true,
      team_seats: true,
      multi_client_management: false,
    },
  },
  accountant_partner: {
    id: "accountant_partner",
    name: "Accountant Partner",
    monthlyPriceAud: null, // contact-us pricing; no Stripe Checkout
    visibility: "contact_only",
    tagline: "For accountants and bookkeepers managing multiple clients.",
    limits: {
      chasedInvoicesPerMonth: -1, // unlimited
      userSeats: -1, // unlimited
      connectedInvoiceSources: -1, // unlimited — exempt from the one-source limit
    },
    features: {
      basic_email_reminders: true,
      email_reminder_sequence: true,
      customer_specific_sequences: true,
      basic_templates: true,
      custom_reminder_templates: true,
      multi_template_customer_wording: true,
      paid_soon_branding: true,
      custom_reply_to: true,
      custom_sender_name: true,
      verified_from_domain: true,
      ai_rewrite: true,
      tone_settings: true,
      payment_status_dashboard: true,
      overdue_invoice_dashboard: true,
      accounting_integrations: true,
      promise_to_pay_tracking: true,
      dispute_pause: true,
      weekly_summary_email: true,
      csv_export: true,
      approval_mode: true,
      contact_suppression: true,
      team_seats: true,
      multi_client_management: false, // planned — not yet implemented
    },
  },
}

/** Ordered lowest to highest, including the hidden contact-only tier at the end. */
export const PLAN_ORDER: SubscriptionTier[] = [
  "starter",
  "solo",
  "small_business",
  "accountant_partner",
]

export function normalizeSubscriptionTier(tier?: string | null): SubscriptionTier {
  if (!tier) return DEFAULT_SUBSCRIPTION_TIER
  if (tier in PLAN_CATALOG) return tier as SubscriptionTier
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

/** Customer-facing plans only, in ascending order. Excludes contact-only tiers
 * such as Accountant Partner — use for pricing pages, plan pickers, and
 * upgrade recommendations. */
export function getPublicPlans(): PlanDefinition[] {
  return PLAN_ORDER.map((tier) => PLAN_CATALOG[tier]).filter(
    (plan) => plan.visibility === "public",
  )
}

export function getPublicPlanSelectionIntent(
  tier?: string | null,
): SubscriptionTier | undefined {
  if (!tier || !(tier in PLAN_CATALOG)) return undefined

  const plan = PLAN_CATALOG[tier as SubscriptionTier]
  return plan.visibility === "public" ? plan.id : undefined
}

export function resolvePlanSelectorTier(
  currentTier: SubscriptionTier,
  preselectedTier?: SubscriptionTier,
  selectedTierOverride?: SubscriptionTier | null,
): SubscriptionTier {
  return selectedTierOverride ?? preselectedTier ?? currentTier
}

export function getPlanChangeImpact(currentTier: SubscriptionTier, targetTier: SubscriptionTier) {
  const currentPlan = PLAN_CATALOG[currentTier]
  const targetPlan = PLAN_CATALOG[targetTier]

  const lostFeatures: string[] = []
  for (const [feature, enabled] of Object.entries(currentPlan.features)) {
    if (enabled && !targetPlan.features[feature as SubscriptionFeature]) {
      lostFeatures.push(featureToLabel(feature as SubscriptionFeature))
    }
  }

  const limitChanges: string[] = []
  const limits: Array<keyof PlanLimits> = [
    "chasedInvoicesPerMonth",
    "userSeats",
    "connectedInvoiceSources",
  ]
  for (const limit of limits) {
    const currentLimit = currentPlan.limits[limit]
    const targetLimit = targetPlan.limits[limit]
    if (targetLimit < currentLimit) {
      const currentValue = formatLimitValue(currentLimit)
      const targetValue = formatLimitValue(targetLimit)
      limitChanges.push(`${currentValue} → ${targetValue}`)
    }
  }

  return {
    lostFeatures,
    limitChanges,
  }
}

export function getPlanChangeBenefits(currentTier: SubscriptionTier, targetTier: SubscriptionTier) {
  const currentPlan = PLAN_CATALOG[currentTier]
  const targetPlan = PLAN_CATALOG[targetTier]

  const gainedFeatures: string[] = []
  for (const [feature, enabled] of Object.entries(targetPlan.features)) {
    if (enabled && !currentPlan.features[feature as SubscriptionFeature]) {
      const featureLabel = featureToLabel(feature as SubscriptionFeature)
      gainedFeatures.push(
        isFeatureImplemented(feature as SubscriptionFeature)
          ? featureLabel
          : `${featureLabel} (coming soon)`,
      )
    }
  }

  const limitChanges: string[] = []
  const limits: Array<keyof PlanLimits> = [
    "chasedInvoicesPerMonth",
    "userSeats",
    "connectedInvoiceSources",
  ]
  for (const limit of limits) {
    const currentLimit = currentPlan.limits[limit]
    const targetLimit = targetPlan.limits[limit]
    if (targetLimit > currentLimit) {
      const currentValue = formatLimitValue(currentLimit)
      const targetValue = formatLimitValue(targetLimit)
      limitChanges.push(`${currentValue} → ${targetValue}`)
    }
  }

  return {
    gainedFeatures,
    limitChanges,
  }
}

function featureToLabel(feature: SubscriptionFeature): string {
  switch (feature) {
    case "custom_reminder_templates":
      return "Custom reminder templates"
    case "custom_sender_name":
      return "Custom sender name"
    case "custom_reply_to":
      return "Custom reply-to"
    case "verified_from_domain":
      return "Verified from domain"
    case "ai_rewrite":
      return "AI rewrite"
    case "tone_settings":
      return "Tone settings"
    case "basic_templates":
      return "Basic templates"
    case "email_reminder_sequence":
      return "Email reminder sequence"
    case "weekly_summary_email":
      return "Weekly summary email"
    case "accounting_integrations":
      return "Accounting integrations"
    case "promise_to_pay_tracking":
      return "Promise-to-pay tracking"
    case "dispute_pause":
      return "Dispute pause"
    case "payment_status_dashboard":
      return "Payment status dashboard"
    case "overdue_invoice_dashboard":
      return "Overdue invoice dashboard"
    case "basic_email_reminders":
      return "Basic email reminders"
    case "team_seats":
      return "Team seats"
    default:
      return feature.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase())
  }
}

function formatLimitValue(limit: number): string {
  return limit === -1 ? "Unlimited" : String(limit)
}