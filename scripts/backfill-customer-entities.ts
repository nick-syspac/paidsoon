/**
 * scripts/backfill-customer-entities.ts
 *
 * One-off backfill for the add-customer-entity change
 * (openspec/changes/add-customer-entity). Populates the new `Customer` table
 * from pre-existing `TrackedInvoice`/`Arrangement` rows so the debtor
 * directory has correct historical data before cron enforcement (never-auto-
 * chase, unsubscribed, cadence override) starts reading it.
 *
 * For each table, rows are grouped by (userId, lower(email)) — the debtor
 * email comes from the tracked invoice's canonical `FinancialInvoice.contact`
 * (`FinancialContact.email`) and from `Arrangement.debtorEmail` — a `Customer`
 * row is upserted per group via the shared `findOrCreateCustomer` helper, and
 * every matching row (case-insensitive email match) is updated with the
 * resulting `customerId`. Rows with no contact / blank email are left
 * unattached — there is nothing to key a `Customer` on.
 *
 * Idempotent: only touches rows where `customerId` is still null, so it is
 * safe to re-run (a second run finds 0 candidates and does nothing).
 *
 * Uses `prismaAdmin` directly — this is a one-time operator-run backfill
 * script, not user-facing route/component code, so it is exempt from the
 * `withUserContext`-only convention (see copilot-instructions.md).
 *
 * Usage:
 *   node --import tsx scripts/backfill-customer-entities.ts
 *
 * Required env vars: SUPABASE_PROJECT_REF, SUPABASE_DB_PASSWORD
 */
import "./_loadEnv"
import { prismaAdmin } from "@/lib/db/admin"
import { findOrCreateCustomer } from "@/lib/db/customers"

type EmailGroup = { userId: string; email: string; name: string | null }

function groupByUserAndEmail<T extends { userId: string }>(
  rows: T[],
  getEmail: (row: T) => string,
  getName: (row: T) => string | null,
): Map<string, EmailGroup> {
  const groups = new Map<string, EmailGroup>()
  for (const row of rows) {
    const email = getEmail(row).trim()
    if (!email) continue
    const key = `${row.userId}:${email.toLowerCase()}`
    if (!groups.has(key)) {
      groups.set(key, { userId: row.userId, email, name: getName(row)?.trim() || null })
    }
  }
  return groups
}

async function backfillTrackedInvoiceCustomers() {
  const rows = await prismaAdmin.trackedInvoice.findMany({
    where: { customerId: null },
    select: {
      userId: true,
      financialInvoice: {
        select: { contact: { select: { email: true, name: true } } },
      },
    },
  })

  console.log(`tracked_invoices: ${rows.length} row(s) missing a customerId`)

  const groups = groupByUserAndEmail(
    rows,
    (row) => row.financialInvoice.contact?.email ?? "",
    (row) => row.financialInvoice.contact?.name ?? null,
  )
  console.log(`tracked_invoices: ${groups.size} distinct (user, email) pair(s) to backfill`)

  let updated = 0
  for (const { userId, email, name } of groups.values()) {
    const customer = await findOrCreateCustomer(prismaAdmin, userId, email, name)
    const result = await prismaAdmin.trackedInvoice.updateMany({
      where: {
        userId,
        customerId: null,
        financialInvoice: { contact: { emailLower: email.toLowerCase() } },
      },
      data: { customerId: customer.id },
    })
    updated += result.count
  }

  console.log(`tracked_invoices: attached customerId to ${updated} row(s)`)
}

async function backfillArrangementCustomers() {
  const rows = await prismaAdmin.arrangement.findMany({
    where: { customerId: null, debtorEmail: { not: "" } },
    select: { userId: true, debtorEmail: true, debtorName: true },
  })

  console.log(`arrangements: ${rows.length} row(s) missing a customerId`)

  const groups = groupByUserAndEmail(
    rows,
    (row) => row.debtorEmail,
    (row) => row.debtorName,
  )
  console.log(`arrangements: ${groups.size} distinct (user, email) pair(s) to backfill`)

  let updated = 0
  for (const { userId, email, name } of groups.values()) {
    const customer = await findOrCreateCustomer(prismaAdmin, userId, email, name)
    const result = await prismaAdmin.arrangement.updateMany({
      where: { userId, customerId: null, debtorEmail: { equals: email, mode: "insensitive" } },
      data: { customerId: customer.id },
    })
    updated += result.count
  }

  console.log(`arrangements: attached customerId to ${updated} row(s)`)
}

async function main() {
  await backfillTrackedInvoiceCustomers()
  await backfillArrangementCustomers()
}

main()
  .catch((err) => {
    console.error("Backfill failed:", err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prismaAdmin.$disconnect()
  })
