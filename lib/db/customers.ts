import type { PrismaTx } from "@/lib/db/withUserContext"

/**
 * Finds the tenant's `Customer` row for `email`, creating it if none exists.
 * Matching is case-insensitive on `primaryEmailLower`; the first-seen casing
 * of `email` is kept as `primaryEmail` for display. Safe to call with either
 * a `withUserContext` transaction or `prismaAdmin` (structurally a superset
 * of `PrismaTx`).
 */
export async function findOrCreateCustomer(
  db: PrismaTx,
  userId: string,
  email: string,
  displayName?: string | null,
) {
  const primaryEmail = email.trim()
  const primaryEmailLower = primaryEmail.toLowerCase()

  return db.customer.upsert({
    where: { userId_primaryEmailLower: { userId, primaryEmailLower } },
    update: {},
    create: {
      userId,
      primaryEmail,
      primaryEmailLower,
      displayName: displayName?.trim() || null,
    },
  })
}
