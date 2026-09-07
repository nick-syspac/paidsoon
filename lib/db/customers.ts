import type { PrismaTx } from "@/lib/db/withUserContext"
import {
  findFinancialContactByEmail,
  upsertFinancialContact,
  type SourceSystem,
} from "@/lib/financial/ingest"

/**
 * Finds the tenant's chasing-preference `Customer` row for `email`, creating it
 * (and its underlying canonical `FinancialContact`) if none exists. Debtor
 * identity lives on the canonical contact; this row carries only chasing
 * preferences. Matching is case-insensitive on the contact's `emailLower`.
 *
 * Safe to call with either a `withUserContext` transaction or `prismaAdmin`
 * (structurally a superset of `PrismaTx`).
 */
export async function findOrCreateCustomer(
  db: PrismaTx,
  userId: string,
  email: string,
  displayName?: string | null,
  sourceSystem: SourceSystem = "csv",
  sourceId?: string,
) {
  const trimmedEmail = email.trim()
  const emailLower = trimmedEmail.toLowerCase()

  // Reuse an existing canonical contact for this debtor when present (so the
  // same debtor appearing from two sources shares one identity); otherwise
  // create one keyed by the source's contact id (or a synthetic email id).
  let contact = await findFinancialContactByEmail(db, userId, trimmedEmail)
  if (!contact) {
    contact = await upsertFinancialContact(db, {
      userId,
      sourceSystem,
      sourceId: sourceId ?? `email:${emailLower}`,
      name: displayName?.trim() || trimmedEmail,
      email: trimmedEmail,
    })
  }

  return db.customer.upsert({
    where: { userId_financialContactId: { userId, financialContactId: contact.id } },
    update: {},
    create: {
      userId,
      financialContactId: contact.id,
    },
  })
}
