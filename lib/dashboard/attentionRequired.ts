import type { InvoiceWithRelations } from "@/lib/dashboard/loadDashboardInvoices"
import { buildAgeingBuckets } from "@/lib/dashboard/ageing"
import { countBrokenPromiseDebtorsAtThreshold } from "@/lib/dashboard/overviewCards"

export type NeedsAttentionCategoryId =
  | "broken_promises"
  | "disputed"
  | "bounced"
  | "overdue_60_plus"
  | "no_contact_email"
  | "import_anomalies"

export interface NeedsAttentionCategory {
  id: NeedsAttentionCategoryId
  label: string
  count: number
  href: string
}

export interface NeedsAttentionSummary {
  total: number
  categories: NeedsAttentionCategory[]
}

const CATEGORY_LABELS: Record<NeedsAttentionCategoryId, string> = {
  broken_promises: "Broken promises",
  disputed: "Disputed",
  bounced: "Bounced emails",
  overdue_60_plus: "Overdue 60+ days",
  no_contact_email: "No contact email",
  import_anomalies: "Import anomalies",
}

const CATEGORY_HREFS: Record<NeedsAttentionCategoryId, string> = {
  broken_promises: "/dashboard/invoices?filter=broken_promises",
  disputed: "/dashboard/invoices?filter=disputed",
  bounced: "/dashboard/invoices?filter=bounced",
  overdue_60_plus: "/dashboard/invoices?filter=overdue_60_plus",
  no_contact_email: "/dashboard/invoices?filter=no_contact_email",
  import_anomalies: "/dashboard/invoices?filter=import_anomalies",
}

/** Invoices with at least one email logged as bounced — reuses each invoice's already-loaded `emailLogs`, no new query. */
function countBouncedInvoices(invoices: Pick<InvoiceWithRelations, "emailLogs">[]): number {
  return invoices.filter((invoice) => invoice.emailLogs.some((log) => log.status === "bounced")).length
}

/**
 * Builds the "Needs Attention" triage queue: a total count plus a
 * per-category breakdown covering every exception type a business owner
 * needs to see, replacing the old flat ranked-message list
 * (openspec/changes/add-needs-attention-queue). Every category is always
 * present, even at zero — a triage queue must never silently hide a
 * category behind a cap.
 */
export function buildNeedsAttentionSummary(input: {
  activeInvoices: Pick<InvoiceWithRelations, "amountDue" | "dueDate" | "emailLogs">[]
  brokenPromiseCountsByDebtor: Record<string, number>
  escalationThreshold: number
  disputedInvoiceCount: number
  noContactEmailCustomerCount: number
  importAnomalyCount: number
  now?: Date
}): NeedsAttentionSummary {
  const now = input.now ?? new Date()

  const ageingBuckets = buildAgeingBuckets(input.activeInvoices, now)
  const overdue60PlusCount =
    (ageingBuckets.find((bucket) => bucket.key === "d61to90")?.count ?? 0) +
    (ageingBuckets.find((bucket) => bucket.key === "d90plus")?.count ?? 0)

  const counts: Record<NeedsAttentionCategoryId, number> = {
    broken_promises: countBrokenPromiseDebtorsAtThreshold(
      input.brokenPromiseCountsByDebtor,
      input.escalationThreshold,
    ),
    disputed: input.disputedInvoiceCount,
    bounced: countBouncedInvoices(input.activeInvoices),
    overdue_60_plus: overdue60PlusCount,
    no_contact_email: input.noContactEmailCustomerCount,
    import_anomalies: input.importAnomalyCount,
  }

  const categories = (Object.keys(CATEGORY_LABELS) as NeedsAttentionCategoryId[]).map((id) => ({
    id,
    label: CATEGORY_LABELS[id],
    count: counts[id],
    href: CATEGORY_HREFS[id],
  }))

  return {
    total: categories.reduce((sum, category) => sum + category.count, 0),
    categories,
  }
}
