/**
 * Canonical invoice read helpers.
 *
 * Chasing/dashboard/email code reads invoice *facts* (amounts, currency, dates,
 * customer identity) from the canonical `FinancialInvoice`/`FinancialContact`
 * records via the chasing record's relation — never from denormalized copies.
 *
 * `canonicalInvoiceSelect` is the single Prisma `include` shape used wherever a
 * chasing record's invoice facts are needed; `flattenCanonicalInvoice` projects
 * the joined record into the flat shape the rest of the chasing pipeline uses.
 *
 * Design: openspec/changes/canonical-financial-data-model (D7).
 */

import { Prisma } from "@/lib/generated/prisma/client"

/** Prisma include fragment joining a TrackedInvoice to its canonical facts. */
export const canonicalInvoiceInclude = {
  financialInvoice: {
    include: {
      contact: true,
    },
  },
} satisfies Prisma.TrackedInvoiceInclude

/** A TrackedInvoice joined to its canonical financial invoice + contact. */
export type TrackedInvoiceWithCanonical = Prisma.TrackedInvoiceGetPayload<{
  include: typeof canonicalInvoiceInclude
}>

/**
 * The flat invoice-facts shape chasing code consumes. Field names preserve the
 * legacy `TrackedInvoice` vocabulary (`amountDue` cents, `clientEmail`,
 * `clientName`, `dueDate`, `paymentUrl`, `currency`) so call-site changes are
 * mechanical, but the values are sourced from the canonical record.
 */
export interface CanonicalInvoiceFacts {
  /** Canonical financial invoice id. */
  financialInvoiceId: string
  /** Fixed original invoice total in cents. */
  amountDue: number
  currency: string
  dueDate: Date
  paymentUrl: string | null
  clientEmail: string
  clientName: string
}

/** Project a joined TrackedInvoice into flat canonical invoice facts. */
export function flattenCanonicalInvoice(
  invoice: TrackedInvoiceWithCanonical,
): CanonicalInvoiceFacts {
  const fi = invoice.financialInvoice
  const contact = fi.contact
  return {
    financialInvoiceId: fi.id,
    amountDue: fi.amountDueCents,
    currency: fi.currency,
    dueDate: fi.dueDate,
    paymentUrl: fi.paymentUrl,
    clientEmail: contact?.email ?? "",
    clientName: contact?.name ?? "",
  }
}
