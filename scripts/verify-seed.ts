/**
 * scripts/verify-seed.ts
 *
 * Lightweight verification that the preview seed data is present and covers
 * all required testing scenarios. Run after `npm run seed:local` or
 * `npm run seed:preview` to confirm the seed worked correctly.
 *
 * Does NOT modify any data — read-only.
 *
 * Usage:
 *   node --import tsx scripts/verify-seed.ts
 *   (or: npm run verify-seed)
 *
 * Exits 0 if all checks pass, 1 if any fail.
 */

import "./_loadEnv"

import { prismaAdmin } from "../lib/db/admin"

const SEED_USER_IDS = [
  "5eed0001-0000-4000-8000-000000000001", // Melbourne Plumbing Co
  "5eed0002-0000-4000-8000-000000000002", // Southbank Design Studio
  "5eed0003-0000-4000-8000-000000000003", // Brisbane Electrical Services
]

async function main(): Promise<void> {
  console.log("=== PaidSoon Seed Verification ===")
  console.log(`Run at: ${new Date().toISOString()}\n`)

  let passed = 0
  let failed = 0

  function check(label: string, condition: boolean): void {
    if (condition) {
      console.log(`  PASS  ${label}`)
      passed++
    } else {
      console.error(`  FAIL  ${label}`)
      failed++
    }
  }

  // -------------------------------------------------------------------------
  // Businesses / user profiles
  // -------------------------------------------------------------------------
  const profiles = await prismaAdmin.userProfile.findMany({
    where: { userId: { in: SEED_USER_IDS } },
  })
  check("At least 3 seeded businesses (user profiles)", profiles.length >= 3)

  const tiers = new Set(profiles.map((p) => p.subscriptionTier))
  check("Has a 'starter' tier user", tiers.has("starter"))
  check("Has a 'business' tier user", tiers.has("business"))
  // Accountant Partner tier is not yet implemented (contact-us only, no seed
  // coverage needed until the partner build-out lands).

  // -------------------------------------------------------------------------
  // Invoices — total count
  // -------------------------------------------------------------------------
  const allInvoices = await prismaAdmin.trackedInvoice.findMany({
    where: { userId: { in: SEED_USER_IDS } },
  })
  check("At least 20 seeded invoices", allInvoices.length >= 20)

  // -------------------------------------------------------------------------
  // Status coverage
  // -------------------------------------------------------------------------
  const statuses = new Set(allInvoices.map((i) => i.status))
  check("Status: 'paid' invoices exist", statuses.has("paid"))
  check("Status: 'pending' invoices exist", statuses.has("pending"))
  check("Status: 'paused' invoices exist (disputed)", statuses.has("paused"))
  check("Status: 'snoozed' invoices exist (promise-to-pay)", statuses.has("snoozed"))
  check("Status: 'sequence_complete' invoices exist", statuses.has("sequence_complete"))
  check("Status: 'manually_resolved' invoices exist", statuses.has("manually_resolved"))

  // -------------------------------------------------------------------------
  // Overdue invoices (pending + past due date)
  // -------------------------------------------------------------------------
  const now = new Date()
  const overdueInvoices = allInvoices.filter(
    (i) => i.status === "pending" && i.dueDate < now,
  )
  check("At least one overdue (pending + past due) invoice", overdueInvoices.length >= 1)
  check("At least three overdue invoices", overdueInvoices.length >= 3)

  // -------------------------------------------------------------------------
  // Promise-to-pay (snoozed)
  // -------------------------------------------------------------------------
  const snoozedInvoices = allInvoices.filter((i) => i.status === "snoozed")
  check("At least one snoozed/promise-to-pay invoice", snoozedInvoices.length >= 1)

  const activePtp = snoozedInvoices.filter(
    (i) => i.snoozedUntil !== null && i.snoozedUntil > now,
  )
  check("At least one active (future) promise-to-pay", activePtp.length >= 1)

  const missedPtp = snoozedInvoices.filter(
    (i) => i.snoozedUntil !== null && i.snoozedUntil < now,
  )
  check("At least one missed (past) promise-to-pay", missedPtp.length >= 1)

  // -------------------------------------------------------------------------
  // MYOB-imported invoices
  // -------------------------------------------------------------------------
  const myobInvoices = allInvoices.filter((i) => i.provider === "myob")
  check("At least one MYOB-imported invoice", myobInvoices.length >= 1)
  check("At least three MYOB-imported invoices", myobInvoices.length >= 3)

  // -------------------------------------------------------------------------
  // Invoice amount variety
  // -------------------------------------------------------------------------
  const maxAmount = Math.max(...allInvoices.map((i) => i.amountDue))
  check("At least one invoice >= $10,000 (large invoice)", maxAmount >= 1_000_000)

  const minAmount = Math.min(...allInvoices.map((i) => i.amountDue))
  check("At least one invoice <= $100 (small invoice)", minAmount <= 10_000)

  // -------------------------------------------------------------------------
  // Client variety
  // -------------------------------------------------------------------------
  const uniqueClients = new Set(allInvoices.map((i) => i.clientEmail))
  check("At least 8 unique client emails", uniqueClients.size >= 8)

  // -------------------------------------------------------------------------
  // Email logs
  // -------------------------------------------------------------------------
  const emailLogs = await prismaAdmin.emailLog.findMany({
    where: { trackedInvoice: { userId: { in: SEED_USER_IDS } } },
  })
  check("At least 5 email logs seeded", emailLogs.length >= 5)
  check("At least one stage-3 email log (final notice)", emailLogs.some((l) => l.stage === 3))

  // -------------------------------------------------------------------------
  // Fake email domain safety check
  // -------------------------------------------------------------------------
  const realLookingEmails = allInvoices.filter(
    (i) => !i.clientEmail.endsWith("-preview.test") && !i.clientEmail.endsWith(".test"),
  )
  check(
    "All client emails use fake .test domains",
    realLookingEmails.length === 0,
  )

  // -------------------------------------------------------------------------
  // Schedules and connections
  // -------------------------------------------------------------------------
  const schedules = await prismaAdmin.schedule.findMany({
    where: { userId: { in: SEED_USER_IDS } },
  })
  check("Each seed user has a schedule", schedules.length >= 3)

  const connections = await prismaAdmin.invoiceConnection.findMany({
    where: { userId: { in: SEED_USER_IDS } },
  })
  check("At least one Stripe connection", connections.some((c) => c.provider === "stripe"))
  check("At least one MYOB connection", connections.some((c) => c.provider === "myob"))

  // -------------------------------------------------------------------------
  // Results
  // -------------------------------------------------------------------------
  console.log(`\n${"─".repeat(50)}`)
  console.log(`Results: ${passed} passed, ${failed} failed`)

  if (failed > 0) {
    console.error("\nSome seed checks FAILED.")
    console.error("Run `npm run seed:local` (or `npm run seed:preview`) to re-seed.")
    process.exit(1)
  } else {
    console.log("\nAll seed checks PASSED. The preview database is ready for testing.")
  }
}

main()
  .catch((err) => {
    console.error("Verification failed:", err)
    process.exit(1)
  })
  .finally(() => prismaAdmin.$disconnect())
