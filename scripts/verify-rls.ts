/**
 * Verify RLS enforcement via Prisma + withUserContext.
 *
 * Run against a DB where:
 *   - DATABASE_URL connects as a role granted `authenticated` (Supabase: `postgres.[ref]`
 *     via the shared pooler)
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
const PROBE_ACCOUNTING_ORG_A = "rls-verify-accounting-org-a"
const PROBE_ACCOUNTING_ORG_B = "rls-verify-accounting-org-b"
const PROBE_SPEND_INSIGHT_A = "rls-verify-spend-insight-a"
const PROBE_SPEND_INSIGHT_B = "rls-verify-spend-insight-b"
const PROBE_CUSTOMER_EMAIL_A = "rls-verify-customer-a@example.com"
const PROBE_CUSTOMER_EMAIL_B = "rls-verify-customer-b@example.com"

function errorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message
  }
  return String(err)
}

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

  await prismaAdmin.spendInsight.create({
    data: {
      id: PROBE_SPEND_INSIGHT_A,
      userId: USER_A,
      findingType: "duplicate_spend",
      subjectKey: "seed-a",
      severity: "medium",
      summary: "Seeded insight A",
      state: "open",
      evidence: { source: "verify-rls", sample: "A" },
    },
  })

  await prismaAdmin.spendInsight.create({
    data: {
      id: PROBE_SPEND_INSIGHT_B,
      userId: USER_B,
      findingType: "duplicate_spend",
      subjectKey: "seed-b",
      severity: "medium",
      summary: "Seeded insight B",
      state: "open",
      evidence: { source: "verify-rls", sample: "B" },
    },
  })

  await prismaAdmin.customer.create({
    data: {
      userId: USER_A,
      primaryEmail: PROBE_CUSTOMER_EMAIL_A,
      primaryEmailLower: PROBE_CUSTOMER_EMAIL_A,
    },
  })
  await prismaAdmin.customer.create({
    data: {
      userId: USER_B,
      primaryEmail: PROBE_CUSTOMER_EMAIL_B,
      primaryEmailLower: PROBE_CUSTOMER_EMAIL_B,
    },
  })
}

async function cleanup() {
  await prismaAdmin.customer.deleteMany({
    where: { primaryEmailLower: { in: [PROBE_CUSTOMER_EMAIL_A, PROBE_CUSTOMER_EMAIL_B] } },
  })
  await prismaAdmin.spendInsight.deleteMany({
    where: { id: { in: [PROBE_SPEND_INSIGHT_A, PROBE_SPEND_INSIGHT_B] } },
  })
  await prismaAdmin.accountingConnection.deleteMany({
    where: { organisationId: { in: [PROBE_ACCOUNTING_ORG_A, PROBE_ACCOUNTING_ORG_B] } },
  })
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

  console.log("\nCheck 3: withUserContext(USER_A) can insert own accounting connection")
  const accountingA = await withUserContext(USER_A, (tx) =>
    tx.accountingConnection.create({
      data: {
        userId: USER_A,
        provider: "myob",
        organisationId: PROBE_ACCOUNTING_ORG_A,
        organisationName: "RLS Verify A",
        encryptedAccessToken: "encrypted-access-a",
        encryptedRefreshToken: "encrypted-refresh-a",
        tokenExpiresAt: new Date("2026-01-01T00:00:00.000Z"),
        scopes: "sme-sales sme-contacts-customer sme-company-file",
        status: "pending_first_sync",
      },
    }),
  )
  if (accountingA.userId !== USER_A || accountingA.organisationId !== PROBE_ACCOUNTING_ORG_A) {
    await cleanup()
    fail("expected USER_A to insert and receive their own accounting connection")
  }
  console.log("  ✓ inserted A accounting connection")

  await prismaAdmin.accountingConnection.create({
    data: {
      userId: USER_B,
      provider: "myob",
      organisationId: PROBE_ACCOUNTING_ORG_B,
      organisationName: "RLS Verify B",
      encryptedAccessToken: "encrypted-access-b",
      encryptedRefreshToken: "encrypted-refresh-b",
      tokenExpiresAt: new Date("2026-01-01T00:00:00.000Z"),
      scopes: "sme-sales sme-contacts-customer sme-company-file",
      status: "pending_first_sync",
    },
  })

  console.log("\nCheck 4: withUserContext(USER_A) sees only A's accounting connection")
  const accountingRows = await withUserContext(USER_A, (tx) =>
    tx.accountingConnection.findMany({
      where: { organisationId: { in: [PROBE_ACCOUNTING_ORG_A, PROBE_ACCOUNTING_ORG_B] } },
    }),
  )
  if (accountingRows.length !== 1 || accountingRows[0].organisationId !== PROBE_ACCOUNTING_ORG_A) {
    await cleanup()
    fail(`expected exactly A's accounting row, got ${JSON.stringify(accountingRows.map((r) => r.organisationId))}`)
  }
  console.log("  ✓ saw only A accounting connection")

  console.log("\nCheck 5: raw connection as `authenticated` role with no claims sees nothing")
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

  console.log("\nCheck 6: withUserContext(USER_A) can update lifecycle spend insight fields")
  const resolvedAt = new Date("2026-01-02T00:00:00.000Z")
  const lifecycleRows = await withUserContext(USER_A, (tx) =>
    tx.$queryRawUnsafe<{ id: string; state: string }[]>(
      `UPDATE spend_insights
       SET state = $1,
           resolved_at = $2
       WHERE id = $3
       RETURNING id, state`,
      "resolved",
      resolvedAt,
      PROBE_SPEND_INSIGHT_A,
    ),
  )
  if (lifecycleRows.length !== 1 || lifecycleRows[0].state !== "resolved") {
    await cleanup()
    fail("expected lifecycle update on own spend insight to succeed")
  }
  console.log("  ✓ lifecycle update succeeded")

  console.log("\nCheck 7: withUserContext(USER_A) cannot update pipeline-owned spend insight fields")
  let blockedPipelineFieldUpdate = false
  try {
    await withUserContext(USER_A, (tx) =>
      tx.$executeRawUnsafe(
        `UPDATE spend_insights SET summary = $1 WHERE id = $2`,
        "Tampered summary",
        PROBE_SPEND_INSIGHT_A,
      ),
    )
  } catch (err) {
    blockedPipelineFieldUpdate = /permission denied|insufficient privilege/i.test(errorMessage(err))
  }

  if (!blockedPipelineFieldUpdate) {
    await cleanup()
    fail("expected non-lifecycle spend insight update to be blocked")
  }
  console.log("  ✓ non-lifecycle update blocked")

  console.log("\nCheck 8: withUserContext(USER_A) sees only A's customer")
  const customerRows = await withUserContext(USER_A, (tx) =>
    tx.customer.findMany({
      where: { primaryEmailLower: { in: [PROBE_CUSTOMER_EMAIL_A, PROBE_CUSTOMER_EMAIL_B] } },
    }),
  )
  if (customerRows.length !== 1 || customerRows[0].primaryEmailLower !== PROBE_CUSTOMER_EMAIL_A) {
    await cleanup()
    fail(`expected exactly A's customer row, got ${JSON.stringify(customerRows.map((r) => r.primaryEmailLower))}`)
  }
  console.log("  ✓ saw only A's customer")

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
