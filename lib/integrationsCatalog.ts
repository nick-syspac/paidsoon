/**
 * Shared source of truth for per-provider integration availability, consumed
 * by every marketing surface that mentions integration status (homepage,
 * /integrations, /roadmap, /faq, marketing /docs). Mirrors the pattern
 * `lib/planPresentation.ts` uses for plan/feature copy — one place to update
 * a provider's status instead of hand-syncing several static arrays.
 */

export type IntegrationId = "stripe" | "myob" | "xero" | "quickbooks"

export type IntegrationStatus = "available" | "early_access" | "planned"

export interface IntegrationDefinition {
  id: IntegrationId
  name: string
  status: IntegrationStatus
  description: string
}

export const INTEGRATIONS_CATALOG: Record<IntegrationId, IntegrationDefinition> = {
  stripe: {
    id: "stripe",
    name: "Stripe Connect",
    status: "available",
    description:
      "Connect your Stripe account via OAuth. PaidSoon monitors your Stripe invoices and automatically sends follow-up reminders when they go overdue.",
  },
  myob: {
    id: "myob",
    name: "MYOB Business",
    status: "available",
    description:
      "Connect a MYOB Business company file to import invoice data and manage follow-ups from PaidSoon.",
  },
  xero: {
    id: "xero",
    name: "Xero",
    status: "available",
    description:
      "Connect Xero to sync overdue invoices automatically and trigger PaidSoon's reminder sequences.",
  },
  quickbooks: {
    id: "quickbooks",
    name: "QuickBooks Online",
    status: "planned",
    description:
      "QuickBooks Online integration for automated invoice monitoring and follow-up emails.",
  },
}

/** Display order used consistently across marketing surfaces. */
export const INTEGRATION_ORDER: IntegrationId[] = ["stripe", "myob", "xero", "quickbooks"]

export const INTEGRATION_STATUS_LABEL: Record<IntegrationStatus, string> = {
  available: "Available",
  early_access: "Early access",
  planned: "Planned",
}

export const INTEGRATION_STATUS_BADGE_STYLES: Record<IntegrationStatus, string> = {
  available: "bg-green-50 text-green-700",
  early_access: "bg-amber-50 text-amber-700",
  planned: "bg-gray-100 text-gray-500",
}

export function getIntegrations(): IntegrationDefinition[] {
  return INTEGRATION_ORDER.map((id) => INTEGRATIONS_CATALOG[id])
}

export function getIntegrationsByStatus(status: IntegrationStatus): IntegrationDefinition[] {
  return getIntegrations().filter((integration) => integration.status === status)
}

/** Joins names with a natural-language "and" (e.g. "Xero, MYOB Business and Stripe Connect"). */
export function formatIntegrationNameList(names: string[]): string {
  if (names.length === 0) return ""
  if (names.length === 1) return names[0]
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
}
