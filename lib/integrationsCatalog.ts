/**
 * Shared source of truth for per-provider integration availability, consumed
 * by every marketing surface that mentions integration status (homepage,
 * /integrations, /roadmap, /faq, marketing /docs). Mirrors the pattern
 * `lib/planPresentation.ts` uses for plan/feature copy — one place to update
 * a provider's status instead of hand-syncing several static arrays.
 */

export type IntegrationId = "stripe" | "myob" | "xero" | "csv" | "quickbooks"

export type IntegrationStatus = "available" | "early_access" | "planned"

export interface IntegrationDefinition {
  id: IntegrationId
  name: string
  status: IntegrationStatus
  href?: string
  categoryLabel: string
  seoTitle: string
  seoDescription: string
  socialImagePath?: string
  headline: string
  summary: string
  description: string
  sourceOfRecord: string
  setupSteps: string[]
  supportedWorkflows: string[]
  differentiators: string[]
  nativeComparison: string
}

export const INTEGRATIONS_CATALOG: Record<IntegrationId, IntegrationDefinition> = {
  stripe: {
    id: "stripe",
    name: "Stripe Connect",
    status: "available",
    href: "/integrations/stripe",
    categoryLabel: "Stripe invoice reminder integration",
    seoTitle: "Stripe Invoice Reminder Automation | PaidSoon",
    seoDescription:
      "Connect Stripe to automate overdue invoice reminders, promise tracking, and dispute pauses with PaidSoon.",
    socialImagePath: "/social/stripe-og.svg",
    headline: "Stripe invoice reminder automation without replacing Stripe.",
    summary:
      "Use Stripe as the invoice system of record while PaidSoon runs the follow-up workflow, tracks promises, and keeps disputes out of the reminder queue.",
    description:
      "Connect your Stripe account via OAuth. PaidSoon monitors your Stripe invoices and automatically sends follow-up reminders when they go overdue.",
    sourceOfRecord: "Stripe remains the invoice source of record. PaidSoon layers follow-up workflow on top of Stripe invoice data.",
    setupSteps: [
      "Connect your Stripe account from PaidSoon using OAuth.",
      "Choose the invoice data PaidSoon should monitor for overdue follow-up.",
      "Set your reminder cadence, sender settings, and escalation rules.",
    ],
    supportedWorkflows: [
      "Automatic overdue invoice monitoring",
      "Three-stage reminder sequences",
      "Promise-to-pay tracking and pause handling",
      "Dispute pauses to stop reminders during active issues",
    ],
    differentiators: [
      "Adds a dedicated debtor follow-up workflow instead of leaving reminders as a side feature.",
      "Tracks promises and disputes so follow-up stays operationally accurate.",
      "Connects receivables activity to wider cash-planning and control modules.",
    ],
    nativeComparison:
      "Stripe records invoices and payments. PaidSoon adds the operational reminder sequence, exception handling, and cross-module cash visibility that sit around those invoices.",
  },
  myob: {
    id: "myob",
    name: "MYOB Business",
    status: "available",
    href: "/integrations/myob",
    categoryLabel: "MYOB invoice reminder integration",
    seoTitle: "MYOB Invoice Reminder Software | PaidSoon",
    seoDescription:
      "Connect MYOB Business to automate overdue invoice follow-ups and debtor tracking with PaidSoon for Australian businesses.",
    socialImagePath: "/social/myob-og.svg",
    headline: "Automated overdue invoice follow-up for MYOB Business users.",
    summary:
      "Keep MYOB Business as the accounting source of truth while PaidSoon handles invoice chasing, promise tracking, and follow-up visibility.",
    description:
      "Connect a MYOB Business company file to import invoice data and manage follow-ups from PaidSoon.",
    sourceOfRecord: "MYOB Business remains the source of record for invoices and payments. PaidSoon uses that data to drive follow-up actions.",
    setupSteps: [
      "Connect your MYOB Business company file from the PaidSoon connections flow.",
      "Confirm the organisation and let PaidSoon sync overdue invoices.",
      "Set reminder sequence and sender settings for follow-up operations.",
    ],
    supportedWorkflows: [
      "Overdue invoice sync from MYOB Business",
      "Automated reminder sequence management",
      "Promise-to-pay tracking and follow-up pause logic",
      "Receivables visibility that feeds broader cash-control workflows",
    ],
    differentiators: [
      "Adds a dedicated debtor workflow on top of MYOB rather than relying on one generic reminder setting.",
      "Gives teams a clearer action queue for who needs chasing next.",
      "Connects overdue invoices to cash-planning and business-control decisions.",
    ],
    nativeComparison:
      "MYOB Business handles accounting records. PaidSoon focuses on the operational follow-up layer: who to chase, when to pause, and what overdue receivables mean for cash flow.",
  },
  xero: {
    id: "xero",
    name: "Xero",
    status: "available",
    href: "/integrations/xero",
    categoryLabel: "Xero invoice reminder integration",
    seoTitle: "Xero Invoice Reminder Automation | PaidSoon",
    seoDescription:
      "Connect Xero to automate overdue invoice reminders, debtor follow-up, and promise tracking with PaidSoon.",
    socialImagePath: "/social/xero-og.svg",
    headline: "Automated invoice reminder software that works alongside Xero.",
    summary:
      "Keep Xero as the accounting source of truth while PaidSoon turns overdue invoices into a disciplined follow-up workflow for Australian small businesses.",
    description:
      "Connect Xero to sync overdue invoices automatically and trigger PaidSoon's reminder sequences.",
    sourceOfRecord: "Xero remains the source of record for invoice and payment data. PaidSoon layers chasing workflow and cash-control actions on top.",
    setupSteps: [
      "Connect your Xero organisation in PaidSoon.",
      "Select the organisation PaidSoon should sync for overdue invoices.",
      "Configure reminder timing and sender controls for your follow-up workflow.",
    ],
    supportedWorkflows: [
      "Automatic sync of overdue Xero invoices",
      "Stage-based reminder emails",
      "Promise-to-pay tracking and dispute pause handling",
      "Receivables signals that connect into broader cash-planning workflows",
    ],
    differentiators: [
      "Adds a more operational reminder workflow than accounting-system defaults alone.",
      "Helps teams manage follow-up exceptions rather than just sending reminders blindly.",
      "Links overdue debtor activity to cash, runway, and commitment decisions elsewhere in PaidSoon.",
    ],
    nativeComparison:
      "Xero records the accounting history. PaidSoon adds the next-action layer: disciplined chasing, exception handling, and cash-impact visibility.",
  },
  csv: {
    id: "csv",
    name: "CSV import",
    status: "available",
    href: "/integrations/csv",
    categoryLabel: "CSV invoice import",
    seoTitle: "CSV Invoice Import for Reminder Automation | PaidSoon",
    seoDescription:
      "Start PaidSoon with CSV invoice import when you are not ready to connect Stripe, Xero, or MYOB yet.",
    socialImagePath: "/social/csv-og.svg",
    headline: "Start invoice reminder automation with CSV import.",
    summary:
      "Upload invoices from a spreadsheet and start using PaidSoon's follow-up workflow before you connect a live provider.",
    description:
      "Import invoices from a CSV spreadsheet when you are not ready to connect Stripe, MYOB, or Xero yet.",
    sourceOfRecord: "Your spreadsheet remains the initial source for imported invoice data until you connect a live provider.",
    setupSteps: [
      "Export your open invoices to CSV.",
      "Upload the file into PaidSoon and review the mapped invoice fields.",
      "Start reminders immediately and connect a provider later if needed.",
    ],
    supportedWorkflows: [
      "Invoice import without an accounting integration",
      "Reminder-sequence setup and debtor follow-up",
      "Promise-to-pay tracking and dispute pause handling",
      "A low-friction starting point for teams still deciding on full integrations",
    ],
    differentiators: [
      "Lets businesses start quickly before OAuth integrations are ready.",
      "Keeps the same debtor workflow available across import and integrated paths.",
      "Gives a practical bridge for teams migrating toward Xero, MYOB, or Stripe connections.",
    ],
    nativeComparison:
      "CSV import is the simplest onboarding path. PaidSoon adds the structured reminder workflow and cash-control follow-up after the data lands.",
  },
  quickbooks: {
    id: "quickbooks",
    name: "QuickBooks Online",
    status: "planned",
    categoryLabel: "QuickBooks invoice reminder integration",
    seoTitle: "QuickBooks Invoice Reminder Integration | PaidSoon",
    seoDescription:
      "QuickBooks Online integration for automated invoice monitoring and follow-up emails is planned in PaidSoon.",
    headline: "QuickBooks Online integration is planned.",
    summary:
      "PaidSoon plans to support QuickBooks Online as a future invoice-data source for debtor workflows.",
    description:
      "QuickBooks Online integration for automated invoice monitoring and follow-up emails.",
    sourceOfRecord: "QuickBooks Online support is planned, so no current source-of-record workflow exists yet.",
    setupSteps: [
      "Register your interest so we can prioritise the integration based on demand.",
    ],
    supportedWorkflows: [
      "Planned future support for invoice syncing and reminder workflows",
    ],
    differentiators: [
      "Will follow the same provider-plus-follow-up model as existing integrations once shipped.",
    ],
    nativeComparison:
      "QuickBooks support is not available yet, so this remains a roadmap item rather than a live comparison page.",
  },
}

/** Display order used consistently across marketing surfaces. */
export const INTEGRATION_ORDER: IntegrationId[] = ["stripe", "myob", "xero", "csv", "quickbooks"]

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

export function getIntegrationById(id: IntegrationId): IntegrationDefinition {
  return INTEGRATIONS_CATALOG[id]
}

export function getIntegrationBySlug(slug: string): IntegrationDefinition | null {
  const match = getIntegrations().find((integration) => integration.id === slug)
  return match ?? null
}

export function getIntegrationLandingPages(): IntegrationDefinition[] {
  return getIntegrations().filter((integration) => integration.href)
}

/** Joins names with a natural-language "and" (e.g. "Xero, MYOB Business and Stripe Connect"). */
export function formatIntegrationNameList(names: string[]): string {
  if (names.length === 0) return ""
  if (names.length === 1) return names[0]
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
}
