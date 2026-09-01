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
const PROBE_CONTACT_EMAIL_A = "rls-verify-contact-a@example.com"
const PROBE_CONTACT_EMAIL_B = "rls-verify-contact-b@example.com"

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

  // Canonical contacts + invoices, each with a linked chasing-workflow record.
  const contactA = await prismaAdmin.financialContact.create({
    data: {
      userId: USER_A,
      sourceSystem: "stripe",
      sourceId: `email:${PROBE_CONTACT_EMAIL_A}`,
      name: "Client A",
      email: PROBE_CONTACT_EMAIL_A,
      emailLower: PROBE_CONTACT_EMAIL_A,
    },
  })
  const contactB = await prismaAdmin.financialContact.create({
    data: {
      userId: USER_B,
      sourceSystem: "stripe",
      sourceId: `email:${PROBE_CONTACT_EMAIL_B}`,
      name: "Client B",
      email: PROBE_CONTACT_EMAIL_B,
      emailLower: PROBE_CONTACT_EMAIL_B,
    },
  })

  const finA = await prismaAdmin.financialInvoice.create({
    data: {
      userId: USER_A,
      sourceSystem: "stripe",
      sourceId: PROBE_EXTERNAL_A,
      contactId: contactA.id,
      amountDueCents: 10000,
      currency: "usd",
      dueDate: new Date("2026-01-01"),
    },
  })
  const finB = await prismaAdmin.financialInvoice.create({
    data: {
      userId: USER_B,
      sourceSystem: "stripe",
      sourceId: PROBE_EXTERNAL_B,
      contactId: contactB.id,
      amountDueCents: 20000,
      currency: "usd",
      dueDate: new Date("2026-01-01"),
    },
  })

  await prismaAdmin.trackedInvoice.create({
    data: {
      userId: USER_A,
      invoiceConnectionId: connA.id,
      financialInvoiceId: finA.id,
    },
  })
  await prismaAdmin.trackedInvoice.create({
    data: {
      userId: USER_B,
      invoiceConnectionId: connB.id,
      financialInvoiceId: finB.id,
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

  // Customer chasing-preference rows keyed to dedicated canonical contacts.
  const custContactA = await prismaAdmin.financialContact.create({
    data: {
      userId: USER_A,
      sourceSystem: "csv",
      sourceId: `email:${PROBE_CUSTOMER_EMAIL_A}`,
      name: "Customer A",
      email: PROBE_CUSTOMER_EMAIL_A,
      emailLower: PROBE_CUSTOMER_EMAIL_A,
    },
  })
  const custContactB = await prismaAdmin.financialContact.create({
    data: {
      userId: USER_B,
      sourceSystem: "csv",
      sourceId: `email:${PROBE_CUSTOMER_EMAIL_B}`,
      name: "Customer B",
      email: PROBE_CUSTOMER_EMAIL_B,
      emailLower: PROBE_CUSTOMER_EMAIL_B,
    },
  })
  await prismaAdmin.customer.create({
    data: { userId: USER_A, financialContactId: custContactA.id },
  })
  await prismaAdmin.customer.create({
    data: { userId: USER_B, financialContactId: custContactB.id },
  })
}

async function cleanup() {
  // Delete in FK-safe order: workflow + children first, then canonical records.
  await prismaAdmin.customer.deleteMany({
    where: { userId: { in: [USER_A, USER_B] } },
  })
  await prismaAdmin.spendInsight.deleteMany({
    where: { id: { in: [PROBE_SPEND_INSIGHT_A, PROBE_SPEND_INSIGHT_B] } },
  })
  await prismaAdmin.accountingConnection.deleteMany({
    where: { organisationId: { in: [PROBE_ACCOUNTING_ORG_A, PROBE_ACCOUNTING_ORG_B] } },
  })
  await prismaAdmin.trackedInvoice.deleteMany({
    where: { userId: { in: [USER_A, USER_B] } },
  })
  await prismaAdmin.financialPayment.deleteMany({
    where: { userId: { in: [USER_A, USER_B] } },
  })
  await prismaAdmin.financialInvoice.deleteMany({
    where: { sourceId: { in: [PROBE_EXTERNAL_A, PROBE_EXTERNAL_B] } },
  })
  await prismaAdmin.financialContact.deleteMany({
    where: { userId: { in: [USER_A, USER_B] } },
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

  console.log("\nCheck 1: withUserContext(USER_A) sees only A's canonical invoice")
  const aRows = await withUserContext(USER_A, (tx) =>
    tx.financialInvoice.findMany({
      where: { sourceId: { in: [PROBE_EXTERNAL_A, PROBE_EXTERNAL_B] } },
    }),
  )
  if (aRows.length !== 1 || aRows[0].sourceId !== PROBE_EXTERNAL_A) {
    await cleanup()
    fail(`expected exactly A's row, got ${JSON.stringify(aRows.map((r) => r.sourceId))}`)
  }
  console.log("  ✓ saw only A")

  console.log("\nCheck 2: withUserContext(USER_B) sees only B's canonical invoice")
  const bRows = await withUserContext(USER_B, (tx) =>
    tx.financialInvoice.findMany({
      where: { sourceId: { in: [PROBE_EXTERNAL_A, PROBE_EXTERNAL_B] } },
    }),
  )
  if (bRows.length !== 1 || bRows[0].sourceId !== PROBE_EXTERNAL_B) {
    await cleanup()
    fail(`expected exactly B's row, got ${JSON.stringify(bRows.map((r) => r.sourceId))}`)
  }
  console.log("  ✓ saw only B")

  console.log("\nCheck 2b: withUserContext(USER_A) sees only A's canonical contact")
  const aContacts = await withUserContext(USER_A, (tx) =>
    tx.financialContact.findMany({
      where: { emailLower: { in: [PROBE_CONTACT_EMAIL_A, PROBE_CONTACT_EMAIL_B] } },
    }),
  )
  if (aContacts.length !== 1 || aContacts[0].emailLower !== PROBE_CONTACT_EMAIL_A) {
    await cleanup()
    fail(`expected exactly A's contact, got ${JSON.stringify(aContacts.map((r) => r.emailLower))}`)
  }
  console.log("  ✓ saw only A's contact")

  console.log("\nCheck 2c: withUserContext(USER_A) sees only A's chasing record via canonical join")
  const aTracked = await withUserContext(USER_A, (tx) =>
    tx.trackedInvoice.findMany({
      where: {
        financialInvoice: { sourceId: { in: [PROBE_EXTERNAL_A, PROBE_EXTERNAL_B] } },
      },
      include: { financialInvoice: { select: { sourceId: true } } },
    }),
  )
  if (aTracked.length !== 1 || aTracked[0].financialInvoice.sourceId !== PROBE_EXTERNAL_A) {
    await cleanup()
    fail("expected exactly A's chasing record joined to A's canonical invoice")
  }
  console.log("  ✓ chasing record joins to canonical invoice correctly")

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
    return tx.$queryRawUnsafe<{ source_id: string }[]>(
      `SELECT source_id FROM financial_invoices WHERE source_id IN ($1, $2)`,
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
  const updatedAt = new Date("2026-01-03T00:00:00.000Z")
  const lifecycleRows = await withUserContext(USER_A, (tx) =>
    tx.$queryRawUnsafe<{ id: string; state: string }[]>(
      `UPDATE spend_insights
       SET state = $1,
           resolved_at = $2,
           updated_at = $3
       WHERE id = $4
       RETURNING id, state`,
      "resolved",
      resolvedAt,
      updatedAt,
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

  console.log("\nCheck 8: withUserContext(USER_A) sees only A's customer (identity via canonical contact)")
  const customerRows = await withUserContext(USER_A, (tx) =>
    tx.customer.findMany({
      where: {
        financialContact: {
          emailLower: { in: [PROBE_CUSTOMER_EMAIL_A, PROBE_CUSTOMER_EMAIL_B] },
        },
      },
      include: { financialContact: { select: { emailLower: true } } },
    }),
  )
  if (
    customerRows.length !== 1 ||
    customerRows[0].financialContact.emailLower !== PROBE_CUSTOMER_EMAIL_A
  ) {
    await cleanup()
    fail(
      `expected exactly A's customer row, got ${JSON.stringify(customerRows.map((r) => r.financialContact.emailLower))}`,
    )
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
