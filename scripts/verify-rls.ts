/**
 * Verify RLS enforcement via Prisma + withUserContext.
 *
 * Run against a DB where:
 *   - DATABASE_URL connects as a role granted `authenticated` (e.g. Supabase `authenticator`)
 *   - DIRECT_URL connects as the migration owner (used here for seed/cleanup)
 *   - rls-policies.sql has been applied
 *
 * Run with:  node --import tsx scripts/verify-rls.ts
 * (env vars are loaded from .env.local automatically)
 *
 * Exits 0 on PASS, 1 on FAIL.
 */

// Load env BEFORE importing anything that reads process.env at module init
// (notably lib/db/admin, which constructs the Prisma client immediately).
// Imports are evaluated in declaration order, so this side-effect import runs first.
import "./_loadEnv"

import { prismaAdmin } from "../lib/db/admin"
import { withUserContext } from "../lib/db/withUserContext"

const USER_A = "00000000-0000-0000-0000-00000000000a"
const USER_B = "00000000-0000-0000-0000-00000000000b"
const PROBE_EXTERNAL_A = "rls-verify-invoice-a"
const PROBE_EXTERNAL_B = "rls-verify-invoice-b"

async function seed() {
  // Two user profiles, two connections, two invoices — one per user.
  for (const userId of [USER_A, USER_B]) {
    await prismaAdmin.userProfile.upsert({
      where: { userId },
      create: { userId },
      update: {},
    })
  }

  const connA = await prismaAdmin.invoiceConnection.create({
    data: { userId: USER_A, provider: "stripe", isActive: true },
  })
  const connB = await prismaAdmin.invoiceConnection.create({
    data: { userId: USER_B, provider: "stripe", isActive: true },
  })

  await prismaAdmin.trackedInvoice.create({
    data: {
      userId: USER_A,
      invoiceConnectionId: connA.id,
      externalId: PROBE_EXTERNAL_A,
      provider: "stripe",
      clientEmail: "client-a@example.com",
      clientName: "Client A",
      amountDue: 10000,
      currency: "usd",
      dueDate: new Date("2026-01-01"),
    },
  })
  await prismaAdmin.trackedInvoice.create({
    data: {
      userId: USER_B,
      invoiceConnectionId: connB.id,
      externalId: PROBE_EXTERNAL_B,
      provider: "stripe",
      clientEmail: "client-b@example.com",
      clientName: "Client B",
      amountDue: 20000,
      currency: "usd",
      dueDate: new Date("2026-01-01"),
    },
  })
}

async function cleanup() {
  await prismaAdmin.trackedInvoice.deleteMany({
    where: { externalId: { in: [PROBE_EXTERNAL_A, PROBE_EXTERNAL_B] } },
  })
  await prismaAdmin.invoiceConnection.deleteMany({
    where: { userId: { in: [USER_A, USER_B] } },
  })
  await prismaAdmin.userProfile.deleteMany({
    where: { userId: { in: [USER_A, USER_B] } },
  })
}

function fail(msg: string): never {
  console.error(`FAIL: ${msg}`)
  process.exit(1)
}

async function main() {
  console.log("Seeding…")
  await cleanup() // in case a previous run left rows
  await seed()

  console.log("\nCheck 1: withUserContext(USER_A) sees only A's invoice")
  const aRows = await withUserContext(USER_A, (tx) =>
    tx.trackedInvoice.findMany({
      where: { externalId: { in: [PROBE_EXTERNAL_A, PROBE_EXTERNAL_B] } },
    }),
  )
  if (aRows.length !== 1 || aRows[0].externalId !== PROBE_EXTERNAL_A) {
    await cleanup()
    fail(`expected exactly A's row, got ${JSON.stringify(aRows.map((r) => r.externalId))}`)
  }
  console.log("  ✓ saw only A")

  console.log("\nCheck 2: withUserContext(USER_B) sees only B's invoice")
  const bRows = await withUserContext(USER_B, (tx) =>
    tx.trackedInvoice.findMany({
      where: { externalId: { in: [PROBE_EXTERNAL_A, PROBE_EXTERNAL_B] } },
    }),
  )
  if (bRows.length !== 1 || bRows[0].externalId !== PROBE_EXTERNAL_B) {
    await cleanup()
    fail(`expected exactly B's row, got ${JSON.stringify(bRows.map((r) => r.externalId))}`)
  }
  console.log("  ✓ saw only B")

  console.log("\nCheck 3: raw connection as `authenticated` role with no claims sees nothing")
  // Run a query that switches role but does NOT set request.jwt.claims.
  // auth.uid() will be NULL, so no RLS policy on tracked_invoices will pass.
  const noContextRows = await prismaAdmin.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL ROLE authenticated`)
    return tx.$queryRawUnsafe<{ externalId: string }[]>(
      `SELECT "externalId" FROM tracked_invoices WHERE "externalId" IN ($1, $2)`,
      PROBE_EXTERNAL_A,
      PROBE_EXTERNAL_B,
    )
  })
  if (noContextRows.length !== 0) {
    await cleanup()
    fail(`expected 0 rows without user context, got ${noContextRows.length}`)
  }
  console.log("  ✓ saw nothing")

  await cleanup()
  console.log("\nPASS: RLS is enforced.")
}

main()
  .catch(async (err) => {
    console.error(err)
    await cleanup().catch(() => {})
    process.exit(1)
  })
  .finally(async () => {
    await prismaAdmin.$disconnect()
  })
