import type { ChaseAllowanceStatus } from "@/lib/billing"
import { isPromiseDebtorHighPriority } from "@/lib/dashboard/promisePriority"
import type { InvoiceWithRelations } from "@/lib/dashboard/loadDashboardInvoices"

export type CardSeverity = "green" | "yellow" | "red"

export type OverviewCardId = "overdue" | "chase_allowance" | "broken_promises" | "held_invoices"

export interface OverviewCard {
  id: OverviewCardId
  label: string
  severity: CardSeverity
  /** Human-readable summary of what's driving the severity, e.g. "3 invoices". */
  stat: string
  /** Secondary line, e.g. a reset date or threshold context. */
  detail?: string
  /** Where clicking the card should take the owner. */
  href: string
}

/** Query param values `filterInvoicesByOverviewCard` understands. */
export type InvoiceOverviewFilter = "overdue" | "broken_promises" | "held"

/**
 * Overdue card severity: green when no active invoice has reached the
 * second reminder, yellow at the second reminder, red once any invoice has
 * had its final reminder sent and is still unresolved. Based on
 * `currentStage` (schedule-agnostic) rather than raw day counts, so it works
 * regardless of a user's custom `Schedule` timing.
 */
export function deriveOverdueSeverity(
  activeInvoices: Pick<InvoiceWithRelations, "currentStage">[],
): CardSeverity {
  if (activeInvoices.some((invoice) => invoice.currentStage === 3)) return "red"
  if (activeInvoices.some((invoice) => invoice.currentStage === 2)) return "yellow"
  return "green"
}

/** Mirrors the existing two-boolean chase-allowance state machine (lib/billing.ts). */
export function deriveChaseAllowanceSeverity(
  chaseAllowance: Pick<ChaseAllowanceStatus, "atCapacity" | "nearLimit"> | null,
): CardSeverity {
  if (!chaseAllowance) return "green"
  if (chaseAllowance.atCapacity) return "red"
  if (chaseAllowance.nearLimit) return "yellow"
  return "green"
}

/** Number of debtors whose broken-promise count has reached the escalation threshold. */
export function countBrokenPromiseDebtorsAtThreshold(
  brokenPromiseCountsByDebtor: Record<string, number>,
  escalationThreshold: number,
): number {
  return Object.values(brokenPromiseCountsByDebtor).filter((count) =>
    isPromiseDebtorHighPriority(count, escalationThreshold),
  ).length
}

/** No yellow state — a broken promise past the threshold is unambiguous. */
export function deriveBrokenPromisesSeverity(brokenDebtorCount: number): CardSeverity {
  return brokenDebtorCount > 0 ? "red" : "green"
}

/** No red state — being held is expected, transient behavior under a volume cap. */
export function deriveHeldInvoicesSeverity(heldInvoiceCount: number): CardSeverity {
  return heldInvoiceCount > 0 ? "yellow" : "green"
}

const CARD_LABELS: Record<OverviewCardId, string> = {
  overdue: "Overdue",
  chase_allowance: "Chase allowance",
  broken_promises: "Broken promises",
  held_invoices: "Held invoices",
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`
}

/**
 * Builds the four Overview summary cards from data already loaded for the
 * dashboard today — no new domain queries (openspec/changes/add-dashboard-overview).
 */
export function buildOverviewCards(input: {
  activeInvoices: Pick<InvoiceWithRelations, "currentStage">[]
  chaseAllowance: ChaseAllowanceStatus | null
  brokenPromiseCountsByDebtor: Record<string, number>
  escalationThreshold: number
  heldInvoiceCount: number
}): OverviewCard[] {
  const brokenDebtorCount = countBrokenPromiseDebtorsAtThreshold(
    input.brokenPromiseCountsByDebtor,
    input.escalationThreshold,
  )

  const overdueSeverity = deriveOverdueSeverity(input.activeInvoices)
  const chaseSeverity = deriveChaseAllowanceSeverity(input.chaseAllowance)
  const brokenSeverity = deriveBrokenPromisesSeverity(brokenDebtorCount)
  const heldSeverity = deriveHeldInvoicesSeverity(input.heldInvoiceCount)

  return [
    {
      id: "overdue",
      label: CARD_LABELS.overdue,
      severity: overdueSeverity,
      stat: pluralize(input.activeInvoices.length, "active invoice"),
      detail:
        overdueSeverity === "red"
          ? "At least one final reminder sent, still unresolved"
          : overdueSeverity === "yellow"
          ? "At least one invoice on its second reminder"
          : undefined,
      href: "/dashboard/invoices?filter=overdue",
    },
    {
      id: "chase_allowance",
      label: CARD_LABELS.chase_allowance,
      severity: chaseSeverity,
      stat: input.chaseAllowance
        ? `${input.chaseAllowance.usage} of ${input.chaseAllowance.allowance} chases used`
        : "No allowance data",
      detail: input.chaseAllowance
        ? `Resets ${input.chaseAllowance.period.end.toLocaleDateString("en-AU", { day: "numeric", month: "short" })}`
        : undefined,
      href: "/dashboard/invoices",
    },
    {
      id: "broken_promises",
      label: CARD_LABELS.broken_promises,
      severity: brokenSeverity,
      stat: pluralize(brokenDebtorCount, "debtor"),
      detail: brokenDebtorCount > 0 ? `At or above your escalation threshold of ${input.escalationThreshold}` : undefined,
      href: "/dashboard/invoices?filter=broken_promises",
    },
    {
      id: "held_invoices",
      label: CARD_LABELS.held_invoices,
      severity: heldSeverity,
      stat: pluralize(input.heldInvoiceCount, "invoice"),
      detail: input.heldInvoiceCount > 0 ? "Waiting for chase-volume allowance to reset" : undefined,
      href: "/dashboard/invoices?filter=held",
    },
  ]
}

/**
 * Filters an already-loaded invoice list down to the subset an Overview card
 * click-through refers to. Pure JS filtering over data already fetched — no
 * new server query variants (design.md Decision 5).
 */
export function filterInvoicesByOverviewCard(
  invoices: InvoiceWithRelations[],
  filter: InvoiceOverviewFilter | null,
  context: {
    brokenPromiseCountsByDebtor: Record<string, number>
    escalationThreshold: number
    heldInvoiceIds: Set<string>
  },
): InvoiceWithRelations[] {
  switch (filter) {
    case "overdue":
      return invoices.filter((invoice) => invoice.currentStage >= 2)
    case "broken_promises":
      return invoices.filter((invoice) =>
        isPromiseDebtorHighPriority(
          context.brokenPromiseCountsByDebtor[invoice.clientEmail.toLowerCase()] ?? 0,
          context.escalationThreshold,
        ),
      )
    case "held":
      return invoices.filter((invoice) => context.heldInvoiceIds.has(invoice.id))
    default:
      return invoices
  }
}

export function parseInvoiceOverviewFilter(value: string | undefined): InvoiceOverviewFilter | null {
  if (value === "overdue" || value === "broken_promises" || value === "held") return value
  return null
}
