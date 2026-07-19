/**
 * scripts/seed-preview.ts
 *
 * Seeds the preview / local database with realistic Australian small-business
 * test data so the product can be exercised end-to-end without real customer
 * data.
 *
 * SAFETY GATES
 * ─────────────
 * The script refuses to run unless:
 *   1. SEED_ENV is explicitly set to one of: local | preview | development | test
 *   2. DATABASE_URL does not contain obvious production project identifiers.
 *
 * It will EXIT 1 (loudly) if SEED_ENV is:
 *   - "production" or "prod"
 *   - unset
 *   - any unknown value
 *
 * IDEMPOTENCY
 * ───────────
 * The three seed user IDs are stable fake UUIDs that will never match a real
 * Supabase auth user. On each run the script deletes all rows owned by those
 * IDs (in FK-safe order) then recreates them, so re-running is always safe.
 *
 * AUTH NOTE
 * ─────────
 * Supabase Auth users are NOT created by this script. The seed user_profiles
 * use synthetic UUIDs. To test full auth flows (sign-in, dashboard) you must
 * create matching auth users manually — see docs/preview-seed-data.md.
 *
 * Usage:
 *   SEED_ENV=local node --import tsx scripts/seed-preview.ts
 *   (or: npm run seed:local)
 */

// Load env BEFORE importing anything that reads process.env at module init.
import "./_loadEnv"

import { prismaAdmin } from "../lib/db/admin"

// ---------------------------------------------------------------------------
// Environment safety check
// ---------------------------------------------------------------------------

const ALLOWED_SEED_ENVS = new Set(["local", "preview", "development", "test"])
const BLOCKED_SEED_ENVS = new Set(["production", "prod"])

function checkEnvironment(): void {
  const seedEnv = process.env.SEED_ENV?.toLowerCase().trim()

  if (!seedEnv) {
    console.error("ERROR: SEED_ENV is not set.")
    console.error(
      "Set SEED_ENV=local (or preview / development / test) before running this script.",
    )
    process.exit(1)
  }

  if (BLOCKED_SEED_ENVS.has(seedEnv)) {
    console.error(`ERROR: SEED_ENV="${seedEnv}" — refusing to seed a production database.`)
    process.exit(1)
  }

  if (!ALLOWED_SEED_ENVS.has(seedEnv)) {
    console.error(`ERROR: Unknown SEED_ENV="${seedEnv}".`)
    console.error(`Allowed values: ${[...ALLOWED_SEED_ENVS].join(", ")}`)
    process.exit(1)
  }

  // Secondary guard: DATABASE_URL must not contain known production identifiers.
  const dbUrl = (process.env.DATABASE_URL ?? "").toLowerCase()
  const prodMarkers = ["paidsoon-prod", "-prod.", ".prod.", "paidsoon_prod"]
  for (const marker of prodMarkers) {
    if (dbUrl.includes(marker)) {
      console.error("ERROR: DATABASE_URL appears to reference a production database.")
      console.error(
        "Verify your .env.local points to the paidsoon-dev project, then retry.",
      )
      process.exit(1)
    }
  }

  console.log(`Environment check passed. SEED_ENV="${seedEnv}"`)
}

// ---------------------------------------------------------------------------
// Stable fake seed user IDs
// These are syntactically valid UUIDs but will never match real auth.users.
// ---------------------------------------------------------------------------

const SEED_USER = {
  melbournePlumbing: "5eed0001-0000-4000-8000-000000000001",
  southbankDesign: "5eed0002-0000-4000-8000-000000000002",
  brisbaneElectrical: "5eed0003-0000-4000-8000-000000000003",
} as const

// ---------------------------------------------------------------------------
// Date helpers — relative to now so aging scenarios stay useful over time
// ---------------------------------------------------------------------------

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86_400_000)
}

function daysFromNow(n: number): Date {
  return new Date(Date.now() + n * 86_400_000)
}

function todayEndOfDay(): Date {
  const d = new Date()
  d.setHours(23, 59, 59, 0)
  return d
}

// ---------------------------------------------------------------------------
// Cleanup — removes ALL rows owned by the seed user IDs (FK-safe order)
// ---------------------------------------------------------------------------

async function cleanup(): Promise<void> {
  console.log("\nCleaning up existing seed data…")

  const userIds = Object.values(SEED_USER)

  // Look up seed-owned parent ids first. TrackedInvoice/ProviderInvoiceMapping/etc.
  // are then deleted by BOTH their own userId AND these parent ids, because a
  // child row's ownership can drift after the fact (e.g. manually reassigned via
  // Prisma Studio) while it still holds a FK to a seed-owned InvoiceConnection or
  // AccountingConnection — which would otherwise strand the parent and break its
  // deleteMany() further down.
  const connections = await prismaAdmin.invoiceConnection.findMany({
    where: { userId: { in: userIds } },
    select: { id: true },
  })
  const connectionIds = connections.map((c) => c.id)

  const accountingConnections = await prismaAdmin.accountingConnection.findMany({
    where: { userId: { in: userIds } },
    select: { id: true },
  })
  const accountingConnectionIds = accountingConnections.map((c) => c.id)

  const invoices = await prismaAdmin.trackedInvoice.findMany({
    where: {
      OR: [{ userId: { in: userIds } }, { invoiceConnectionId: { in: connectionIds } }],
    },
    select: { id: true },
  })
  const invoiceIds = invoices.map((i) => i.id)

  const arrangements = await prismaAdmin.arrangement.findMany({
    where: { userId: { in: userIds } },
    select: { id: true },
  })
  const arrangementIds = arrangements.map((a) => a.id)

  // Leaf tables that reference TrackedInvoice / AccountingConnection
  if (invoiceIds.length > 0) {
    await prismaAdmin.emailLog.deleteMany({ where: { trackedInvoiceId: { in: invoiceIds } } })
    await prismaAdmin.promiseToPay.deleteMany({ where: { trackedInvoiceId: { in: invoiceIds } } })
  }
  if (invoiceIds.length > 0 || accountingConnectionIds.length > 0) {
    await prismaAdmin.providerInvoiceMapping.deleteMany({
      where: {
        OR: [
          { trackedInvoiceId: { in: invoiceIds } },
          { accountingConnectionId: { in: accountingConnectionIds } },
        ],
      },
    })
  }
  if (invoiceIds.length > 0 || arrangementIds.length > 0) {
    await prismaAdmin.arrangementInvoiceCoverage.deleteMany({
      where: {
        OR: [
          { trackedInvoiceId: { in: invoiceIds } },
          { arrangementId: { in: arrangementIds } },
        ],
      },
    })
  }
  if (accountingConnectionIds.length > 0) {
    await prismaAdmin.providerContactMapping.deleteMany({
      where: { accountingConnectionId: { in: accountingConnectionIds } },
    })
    await prismaAdmin.accountingSyncRun.deleteMany({
      where: { accountingConnectionId: { in: accountingConnectionIds } },
    })
  }

  // Children of UserProfile
  if (invoiceIds.length > 0) {
    await prismaAdmin.trackedInvoice.deleteMany({ where: { id: { in: invoiceIds } } })
  }
  await prismaAdmin.emailSettings.deleteMany({ where: { userId: { in: userIds } } })
  await prismaAdmin.schedule.deleteMany({ where: { userId: { in: userIds } } })
  await prismaAdmin.emailTemplate.deleteMany({ where: { userId: { in: userIds } } })
  await prismaAdmin.promiseEscalationPolicy.deleteMany({ where: { userId: { in: userIds } } })
  await prismaAdmin.arrangement.deleteMany({ where: { userId: { in: userIds } } })
  await prismaAdmin.accountingConnection.deleteMany({ where: { userId: { in: userIds } } })
  await prismaAdmin.invoiceConnection.deleteMany({ where: { userId: { in: userIds } } })
  // AiUsageLog rows cascade automatically (onDelete: Cascade on the UserProfile FK).

  // Root
  await prismaAdmin.userProfile.deleteMany({ where: { userId: { in: userIds } } })

  console.log("  ✓ Cleanup complete")
}

// ---------------------------------------------------------------------------
// Seed — User 1: Melbourne Plumbing Co (solo tier)
// Scenario: healthy business, mostly paid, a few overdue, one disputed/paused,
//           one promise-to-pay (snoozed).
// ---------------------------------------------------------------------------

async function seedMelbournePlumbing(): Promise<void> {
  const userId = SEED_USER.melbournePlumbing
  console.log("\nSeeding Melbourne Plumbing Co (solo)…")

  await prismaAdmin.userProfile.create({
    data: { userId, subscriptionTier: "solo", subscriptionStatus: "active" },
  })

  await prismaAdmin.schedule.create({
    data: { userId, email1DaysAfterDue: 3, email2DaysAfterDue: 10, email3DaysAfterDue: 21 },
  })

  await prismaAdmin.emailSettings.create({
    data: {
      userId,
      fromEmail: "billing@melbourneplumbing-preview.test",
      fromName: "Melbourne Plumbing Co",
      replyTo: "accounts@melbourneplumbing-preview.test",
      resendVerified: false,
    },
  })

  const conn = await prismaAdmin.invoiceConnection.create({
    data: {
      userId,
      provider: "stripe",
      stripeConnectAccountId: "acct_preview_melb_plumbing",
      isActive: true,
    },
  })

  // 1. Paid — Good Payer Pty Ltd ($850)
  await prismaAdmin.trackedInvoice.create({
    data: {
      userId,
      invoiceConnectionId: conn.id,
      externalId: "seed-melb-inv-001",
      provider: "stripe",
      clientEmail: "accounts@goodpayer-preview.test",
      clientName: "Good Payer Pty Ltd",
      amountDue: 85000,
      currency: "aud",
      dueDate: daysAgo(30),
      status: "paid",
      currentStage: 0,
    },
  })

  // 2. Paid — BuildRight Constructions ($2,750) — email1 was sent before payment
  const inv2 = await prismaAdmin.trackedInvoice.create({
    data: {
      userId,
      invoiceConnectionId: conn.id,
      externalId: "seed-melb-inv-002",
      provider: "stripe",
      clientEmail: "finance@buildright-preview.test",
      clientName: "BuildRight Constructions",
      amountDue: 275000,
      currency: "aud",
      dueDate: daysAgo(45),
      status: "paid",
      currentStage: 1,
    },
  })

  // 3. Pending — due in 7 days, not yet overdue ($1,200)
  await prismaAdmin.trackedInvoice.create({
    data: {
      userId,
      invoiceConnectionId: conn.id,
      externalId: "seed-melb-inv-003",
      provider: "stripe",
      clientEmail: "payables@acmehardware-preview.test",
      clientName: "ACME Hardware Supplies",
      amountDue: 120000,
      currency: "aud",
      dueDate: daysFromNow(7),
      status: "pending",
      currentStage: 0,
    },
  })

  // 4. Pending — due today ($350)
  await prismaAdmin.trackedInvoice.create({
    data: {
      userId,
      invoiceConnectionId: conn.id,
      externalId: "seed-melb-inv-004",
      provider: "stripe",
      clientEmail: "ap@fastbuild-preview.test",
      clientName: "FastBuild Pty Ltd",
      amountDue: 35000,
      currency: "aud",
      dueDate: todayEndOfDay(),
      status: "pending",
      currentStage: 0,
    },
  })

  // 5. Pending — 7 days overdue, email1 sent ($5,500)
  const inv5 = await prismaAdmin.trackedInvoice.create({
    data: {
      userId,
      invoiceConnectionId: conn.id,
      externalId: "seed-melb-inv-005",
      provider: "stripe",
      clientEmail: "accounts@reliablecorp-preview.test",
      clientName: "Reliable Corp",
      amountDue: 550000,
      currency: "aud",
      dueDate: daysAgo(7),
      status: "pending",
      currentStage: 1,
      nextEmailAt: daysFromNow(3),
    },
  })

  // 6. Pending — 14 days overdue, email1 sent, email2 due today ($850)
  const inv6 = await prismaAdmin.trackedInvoice.create({
    data: {
      userId,
      invoiceConnectionId: conn.id,
      externalId: "seed-melb-inv-006",
      provider: "stripe",
      clientEmail: "billing@northstarprops-preview.test",
      clientName: "NorthStar Properties",
      amountDue: 85000,
      currency: "aud",
      dueDate: daysAgo(14),
      status: "pending",
      currentStage: 1,
      nextEmailAt: daysFromNow(0),
    },
  })

  // 7. Sequence complete — all 3 emails sent, still unpaid ($1,200)
  const inv7 = await prismaAdmin.trackedInvoice.create({
    data: {
      userId,
      invoiceConnectionId: conn.id,
      externalId: "seed-melb-inv-007",
      provider: "stripe",
      clientEmail: "payables@olddebtco-preview.test",
      clientName: "Old Debt Co",
      amountDue: 120000,
      currency: "aud",
      dueDate: daysAgo(30),
      status: "sequence_complete",
      currentStage: 3,
    },
  })

  // 8. Manually resolved — small invoice ($99)
  await prismaAdmin.trackedInvoice.create({
    data: {
      userId,
      invoiceConnectionId: conn.id,
      externalId: "seed-melb-inv-008",
      provider: "stripe",
      clientEmail: "accounts@fixedcorp-preview.test",
      clientName: "Fixed Corp",
      amountDue: 9900,
      currency: "aud",
      dueDate: daysAgo(25),
      status: "manually_resolved",
      currentStage: 0,
    },
  })

  // 9. Paused (disputed) — 20 days overdue, reminders on hold ($5,500)
  await prismaAdmin.trackedInvoice.create({
    data: {
      userId,
      invoiceConnectionId: conn.id,
      externalId: "seed-melb-inv-009",
      provider: "stripe",
      clientEmail: "disputes@contractcorp-preview.test",
      clientName: "Contract Dispute Corp",
      amountDue: 550000,
      currency: "aud",
      dueDate: daysAgo(20),
      status: "paused",
      currentStage: 0,
    },
  })

  // 10. Snoozed (promise-to-pay in 7 days) — 10 days overdue ($2,750)
  await prismaAdmin.trackedInvoice.create({
    data: {
      userId,
      invoiceConnectionId: conn.id,
      externalId: "seed-melb-inv-010",
      provider: "stripe",
      clientEmail: "finance@promisepayer-preview.test",
      clientName: "Promise Payer Co",
      amountDue: 275000,
      currency: "aud",
      dueDate: daysAgo(10),
      status: "snoozed",
      currentStage: 1,
      snoozedUntil: daysFromNow(7),
      nextEmailAt: daysFromNow(7),
    },
  })

  // Email logs
  await prismaAdmin.emailLog.create({
    data: {
      trackedInvoiceId: inv2.id,
      stage: 1,
      sentAt: daysAgo(38),
      fromAddress: "reminders@paidsoon.io",
      subject: "Friendly reminder: your invoice from Melbourne Plumbing Co is overdue",
    },
  })

  await prismaAdmin.emailLog.create({
    data: {
      trackedInvoiceId: inv5.id,
      stage: 1,
      sentAt: daysAgo(4),
      fromAddress: "reminders@paidsoon.io",
      subject: "Friendly reminder: your invoice from Melbourne Plumbing Co is overdue",
    },
  })

  await prismaAdmin.emailLog.create({
    data: {
      trackedInvoiceId: inv6.id,
      stage: 1,
      sentAt: daysAgo(11),
      fromAddress: "reminders@paidsoon.io",
      subject: "Friendly reminder: your invoice from Melbourne Plumbing Co is overdue",
    },
  })

  await prismaAdmin.emailLog.createMany({
    data: [
      {
        trackedInvoiceId: inv7.id,
        stage: 1,
        sentAt: daysAgo(27),
        fromAddress: "reminders@paidsoon.io",
        subject: "Friendly reminder: your invoice from Melbourne Plumbing Co is overdue",
      },
      {
        trackedInvoiceId: inv7.id,
        stage: 2,
        sentAt: daysAgo(20),
        fromAddress: "reminders@paidsoon.io",
        subject: "Second notice: your invoice from Melbourne Plumbing Co remains unpaid",
      },
      {
        trackedInvoiceId: inv7.id,
        stage: 3,
        sentAt: daysAgo(9),
        fromAddress: "reminders@paidsoon.io",
        subject:
          "Final notice: immediate payment required — Melbourne Plumbing Co",
      },
    ],
  })

  console.log("  ✓ Melbourne Plumbing Co — 10 invoices, 6 email logs")
}

// ---------------------------------------------------------------------------
// Seed — User 2: Southbank Design Studio (small_business tier)
// Scenario: several overdue, one disputed, one recurring late-payer client,
//           very large pending invoice, missed promise-to-pay.
// ---------------------------------------------------------------------------

async function seedSouthbankDesign(): Promise<void> {
  const userId = SEED_USER.southbankDesign
  console.log("\nSeeding Southbank Design Studio (small_business)…")

  await prismaAdmin.userProfile.create({
    data: { userId, subscriptionTier: "small_business", subscriptionStatus: "active" },
  })

  await prismaAdmin.schedule.create({
    data: { userId, email1DaysAfterDue: 3, email2DaysAfterDue: 10, email3DaysAfterDue: 21 },
  })

  await prismaAdmin.emailSettings.create({
    data: {
      userId,
      fromEmail: "billing@southbankdesign-preview.test",
      fromName: "Southbank Design Studio",
      replyTo: "studio@southbankdesign-preview.test",
      resendVerified: true,
    },
  })

  const conn = await prismaAdmin.invoiceConnection.create({
    data: {
      userId,
      provider: "stripe",
      stripeConnectAccountId: "acct_preview_southbank_design",
      isActive: true,
    },
  })

  // 1. Paid — recent, on time ($1,250)
  await prismaAdmin.trackedInvoice.create({
    data: {
      userId,
      invoiceConnectionId: conn.id,
      externalId: "seed-sbank-inv-001",
      provider: "stripe",
      clientEmail: "accounts@creativeworks-preview.test",
      clientName: "Creative Works Agency",
      amountDue: 125000,
      currency: "aud",
      dueDate: daysAgo(10),
      status: "paid",
      currentStage: 0,
    },
  })

  // 2. Pending — 7 days overdue, email1 sent, LateAgain Marketing ($1,890)
  const inv2 = await prismaAdmin.trackedInvoice.create({
    data: {
      userId,
      invoiceConnectionId: conn.id,
      externalId: "seed-sbank-inv-002",
      provider: "stripe",
      clientEmail: "payables@lateagain-preview.test",
      clientName: "LateAgain Marketing",
      amountDue: 189000,
      currency: "aud",
      dueDate: daysAgo(7),
      status: "pending",
      currentStage: 1,
      nextEmailAt: daysFromNow(3),
    },
  })

  // 3. Pending — 30 days overdue, email2 sent, LateAgain Marketing ($4,200)
  //    Demonstrates a recurring late payer with multiple open invoices.
  const inv3 = await prismaAdmin.trackedInvoice.create({
    data: {
      userId,
      invoiceConnectionId: conn.id,
      externalId: "seed-sbank-inv-003",
      provider: "stripe",
      clientEmail: "payables@lateagain-preview.test",
      clientName: "LateAgain Marketing",
      amountDue: 420000,
      currency: "aud",
      dueDate: daysAgo(30),
      status: "pending",
      currentStage: 2,
      nextEmailAt: daysFromNow(1),
    },
  })

  // 4. Sequence complete — 65 days overdue, LateAgain Marketing ($3,120)
  const inv4 = await prismaAdmin.trackedInvoice.create({
    data: {
      userId,
      invoiceConnectionId: conn.id,
      externalId: "seed-sbank-inv-004",
      provider: "stripe",
      clientEmail: "payables@lateagain-preview.test",
      clientName: "LateAgain Marketing",
      amountDue: 312000,
      currency: "aud",
      dueDate: daysAgo(65),
      status: "sequence_complete",
      currentStage: 3,
    },
  })

  // 5. Paused (disputed — incorrect amount claimed) — 15 days overdue ($8,750)
  const inv5 = await prismaAdmin.trackedInvoice.create({
    data: {
      userId,
      invoiceConnectionId: conn.id,
      externalId: "seed-sbank-inv-005",
      provider: "stripe",
      clientEmail: "finance@northstaragency-preview.test",
      clientName: "NorthStar Agency",
      amountDue: 875000,
      currency: "aud",
      dueDate: daysAgo(15),
      status: "paused",
      currentStage: 1,
    },
  })

  // 6. Pending — 14 days overdue, email1 sent, email2 due today ($560)
  const inv6 = await prismaAdmin.trackedInvoice.create({
    data: {
      userId,
      invoiceConnectionId: conn.id,
      externalId: "seed-sbank-inv-006",
      provider: "stripe",
      clientEmail: "accounts@boldbrands-preview.test",
      clientName: "Bold Brands Co",
      amountDue: 56000,
      currency: "aud",
      dueDate: daysAgo(14),
      status: "pending",
      currentStage: 1,
      nextEmailAt: daysFromNow(0),
    },
  })

  // 7. Pending — due in 14 days, not yet overdue ($3,250)
  await prismaAdmin.trackedInvoice.create({
    data: {
      userId,
      invoiceConnectionId: conn.id,
      externalId: "seed-sbank-inv-007",
      provider: "stripe",
      clientEmail: "billing@pixelmedia-preview.test",
      clientName: "Pixel Media Group",
      amountDue: 325000,
      currency: "aud",
      dueDate: daysFromNow(14),
      status: "pending",
      currentStage: 0,
    },
  })

  // 8. Pending — very large invoice, due in 30 days ($48,750)
  await prismaAdmin.trackedInvoice.create({
    data: {
      userId,
      invoiceConnectionId: conn.id,
      externalId: "seed-sbank-inv-008",
      provider: "stripe",
      clientEmail: "ap@bigretail-preview.test",
      clientName: "Big Retail Group",
      amountDue: 4875000,
      currency: "aud",
      dueDate: daysFromNow(30),
      status: "pending",
      currentStage: 0,
    },
  })

  // 9. Snoozed (promise-to-pay missed — promise date was 2 days ago) ($1,950)
  await prismaAdmin.trackedInvoice.create({
    data: {
      userId,
      invoiceConnectionId: conn.id,
      externalId: "seed-sbank-inv-009",
      provider: "stripe",
      clientEmail: "payables@delaycorp-preview.test",
      clientName: "Delay Corp",
      amountDue: 195000,
      currency: "aud",
      dueDate: daysAgo(25),
      status: "snoozed",
      currentStage: 1,
      snoozedUntil: daysAgo(2),
      nextEmailAt: daysAgo(2),
    },
  })

  // Email logs
  await prismaAdmin.emailLog.create({
    data: {
      trackedInvoiceId: inv2.id,
      stage: 1,
      sentAt: daysAgo(4),
      fromAddress: "billing@southbankdesign-preview.test",
      subject: "Friendly reminder: your invoice from Southbank Design Studio is overdue",
    },
  })

  await prismaAdmin.emailLog.createMany({
    data: [
      {
        trackedInvoiceId: inv3.id,
        stage: 1,
        sentAt: daysAgo(27),
        fromAddress: "billing@southbankdesign-preview.test",
        subject: "Friendly reminder: your invoice from Southbank Design Studio is overdue",
      },
      {
        trackedInvoiceId: inv3.id,
        stage: 2,
        sentAt: daysAgo(20),
        fromAddress: "billing@southbankdesign-preview.test",
        subject: "Second notice: your invoice from Southbank Design Studio remains unpaid",
      },
    ],
  })

  await prismaAdmin.emailLog.createMany({
    data: [
      {
        trackedInvoiceId: inv4.id,
        stage: 1,
        sentAt: daysAgo(62),
        fromAddress: "billing@southbankdesign-preview.test",
        subject: "Friendly reminder: your invoice from Southbank Design Studio is overdue",
      },
      {
        trackedInvoiceId: inv4.id,
        stage: 2,
        sentAt: daysAgo(55),
        fromAddress: "billing@southbankdesign-preview.test",
        subject: "Second notice: your invoice from Southbank Design Studio remains unpaid",
      },
      {
        trackedInvoiceId: inv4.id,
        stage: 3,
        sentAt: daysAgo(44),
        fromAddress: "billing@southbankdesign-preview.test",
        subject:
          "Final notice: immediate payment required — Southbank Design Studio",
      },
    ],
  })

  await prismaAdmin.emailLog.create({
    data: {
      trackedInvoiceId: inv5.id,
      stage: 1,
      sentAt: daysAgo(12),
      fromAddress: "billing@southbankdesign-preview.test",
      subject: "Friendly reminder: your invoice from Southbank Design Studio is overdue",
    },
  })

  await prismaAdmin.emailLog.create({
    data: {
      trackedInvoiceId: inv6.id,
      stage: 1,
      sentAt: daysAgo(11),
      fromAddress: "billing@southbankdesign-preview.test",
      subject: "Friendly reminder: your invoice from Southbank Design Studio is overdue",
    },
  })

  console.log("  ✓ Southbank Design Studio — 9 invoices, 8 email logs")
}

// ---------------------------------------------------------------------------
// Seed — User 3: Brisbane Electrical Services (starter tier)
// Scenario: MYOB-style imported invoices, mixed statuses, two promise-to-pay
//           (one active, one forthcoming), one broken promise, one disputed.
// ---------------------------------------------------------------------------

async function seedBrisbaneElectrical(): Promise<void> {
  const userId = SEED_USER.brisbaneElectrical
  console.log("\nSeeding Brisbane Electrical Services (starter)…")

  await prismaAdmin.userProfile.create({
    data: { userId, subscriptionTier: "starter", subscriptionStatus: "active" },
  })

  await prismaAdmin.schedule.create({
    data: { userId, email1DaysAfterDue: 5, email2DaysAfterDue: 14, email3DaysAfterDue: 30 },
  })

  // No EmailSettings — starter tier uses system domain.

  // Stripe Connect account
  const stripeConn = await prismaAdmin.invoiceConnection.create({
    data: {
      userId,
      provider: "stripe",
      stripeConnectAccountId: "acct_preview_brisbane_elec",
      isActive: true,
    },
  })

  // Simulated MYOB import connection (provider="myob", no stripeConnectAccountId)
  const myobConn = await prismaAdmin.invoiceConnection.create({
    data: { userId, provider: "myob", isActive: true },
  })

  // --- MYOB imported invoices ---

  // 1. MYOB — paid ($1,250)
  await prismaAdmin.trackedInvoice.create({
    data: {
      userId,
      invoiceConnectionId: myobConn.id,
      externalId: "MYOB-BES-00412",
      provider: "myob",
      clientEmail: "accounts@bigbuild-preview.test",
      clientName: "BigBuild Construction",
      amountDue: 125000,
      currency: "aud",
      dueDate: daysAgo(20),
      status: "paid",
      currentStage: 0,
    },
  })

  // 2. MYOB — 7 days overdue, email1 sent ($1,950)
  const inv2 = await prismaAdmin.trackedInvoice.create({
    data: {
      userId,
      invoiceConnectionId: myobConn.id,
      externalId: "MYOB-BES-00418",
      provider: "myob",
      clientEmail: "payables@safetyfirst-preview.test",
      clientName: "Safety First Corp",
      amountDue: 195000,
      currency: "aud",
      dueDate: daysAgo(7),
      status: "pending",
      currentStage: 1,
      nextEmailAt: daysFromNow(7),
    },
  })

  // 3. MYOB — 30 days overdue, email2 sent, large invoice ($12,500)
  const inv3 = await prismaAdmin.trackedInvoice.create({
    data: {
      userId,
      invoiceConnectionId: myobConn.id,
      externalId: "MYOB-BES-00401",
      provider: "myob",
      clientEmail: "finance@industrialco-preview.test",
      clientName: "Industrial Co Pty Ltd",
      amountDue: 1250000,
      currency: "aud",
      dueDate: daysAgo(30),
      status: "pending",
      currentStage: 2,
      nextEmailAt: daysFromNow(1),
    },
  })

  // 4. MYOB — paused (disputed, work incomplete) — 45 days overdue ($3,300)
  const inv4 = await prismaAdmin.trackedInvoice.create({
    data: {
      userId,
      invoiceConnectionId: myobConn.id,
      externalId: "MYOB-BES-00398",
      provider: "myob",
      clientEmail: "accounts@workshopdispute-preview.test",
      clientName: "Workshop Dispute Co",
      amountDue: 330000,
      currency: "aud",
      dueDate: daysAgo(45),
      status: "paused",
      currentStage: 2,
    },
  })

  // --- Stripe invoices ---

  // 5. Stripe — snoozed, promise-to-pay due tomorrow ($895)
  await prismaAdmin.trackedInvoice.create({
    data: {
      userId,
      invoiceConnectionId: stripeConn.id,
      externalId: "seed-bris-inv-005",
      provider: "stripe",
      clientEmail: "finance@promisebuild-preview.test",
      clientName: "PromiseBuild Pty Ltd",
      amountDue: 89500,
      currency: "aud",
      dueDate: daysAgo(12),
      status: "snoozed",
      currentStage: 1,
      snoozedUntil: daysFromNow(1),
      nextEmailAt: daysFromNow(1),
    },
  })

  // 6. Stripe — snoozed, promise-to-pay in 7 days ($4,250)
  await prismaAdmin.trackedInvoice.create({
    data: {
      userId,
      invoiceConnectionId: stripeConn.id,
      externalId: "seed-bris-inv-006",
      provider: "stripe",
      clientEmail: "ap@renewpower-preview.test",
      clientName: "RenewPower Solutions",
      amountDue: 425000,
      currency: "aud",
      dueDate: daysAgo(18),
      status: "snoozed",
      currentStage: 1,
      snoozedUntil: daysFromNow(7),
      nextEmailAt: daysFromNow(7),
    },
  })

  // 7. Stripe — manually resolved ($540)
  const inv7 = await prismaAdmin.trackedInvoice.create({
    data: {
      userId,
      invoiceConnectionId: stripeConn.id,
      externalId: "seed-bris-inv-007",
      provider: "stripe",
      clientEmail: "billing@resolvedco-preview.test",
      clientName: "Resolved Co",
      amountDue: 54000,
      currency: "aud",
      dueDate: daysAgo(35),
      status: "manually_resolved",
      currentStage: 2,
    },
  })

  // 8. Stripe — due in 14 days, not yet overdue ($9,500)
  await prismaAdmin.trackedInvoice.create({
    data: {
      userId,
      invoiceConnectionId: stripeConn.id,
      externalId: "seed-bris-inv-008",
      provider: "stripe",
      clientEmail: "accounts@newclient-preview.test",
      clientName: "New Client Pty Ltd",
      amountDue: 950000,
      currency: "aud",
      dueDate: daysFromNow(14),
      status: "pending",
      currentStage: 0,
    },
  })

  // Email logs
  await prismaAdmin.emailLog.create({
    data: {
      trackedInvoiceId: inv2.id,
      stage: 1,
      sentAt: daysAgo(2),
      fromAddress: "reminders@paidsoon.io",
      subject: "Friendly reminder: your invoice from Brisbane Electrical Services is overdue",
    },
  })

  await prismaAdmin.emailLog.createMany({
    data: [
      {
        trackedInvoiceId: inv3.id,
        stage: 1,
        sentAt: daysAgo(25),
        fromAddress: "reminders@paidsoon.io",
        subject: "Friendly reminder: your invoice from Brisbane Electrical Services is overdue",
      },
      {
        trackedInvoiceId: inv3.id,
        stage: 2,
        sentAt: daysAgo(16),
        fromAddress: "reminders@paidsoon.io",
        subject:
          "Second notice: your invoice from Brisbane Electrical Services remains unpaid",
      },
    ],
  })

  await prismaAdmin.emailLog.createMany({
    data: [
      {
        trackedInvoiceId: inv4.id,
        stage: 1,
        sentAt: daysAgo(42),
        fromAddress: "reminders@paidsoon.io",
        subject: "Friendly reminder: your invoice from Brisbane Electrical Services is overdue",
      },
      {
        trackedInvoiceId: inv4.id,
        stage: 2,
        sentAt: daysAgo(31),
        fromAddress: "reminders@paidsoon.io",
        subject:
          "Second notice: your invoice from Brisbane Electrical Services remains unpaid",
      },
    ],
  })

  await prismaAdmin.emailLog.createMany({
    data: [
      {
        trackedInvoiceId: inv7.id,
        stage: 1,
        sentAt: daysAgo(32),
        fromAddress: "reminders@paidsoon.io",
        subject: "Friendly reminder: your invoice from Brisbane Electrical Services is overdue",
      },
      {
        trackedInvoiceId: inv7.id,
        stage: 2,
        sentAt: daysAgo(21),
        fromAddress: "reminders@paidsoon.io",
        subject:
          "Second notice: your invoice from Brisbane Electrical Services remains unpaid",
      },
    ],
  })

  console.log("  ✓ Brisbane Electrical Services — 8 invoices, 7 email logs")
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  checkEnvironment()

  console.log("\n=== PaidSoon Preview Seed ===")
  console.log(`Run at: ${new Date().toISOString()}`)

  await cleanup()

  await seedMelbournePlumbing()
  await seedSouthbankDesign()
  await seedBrisbaneElectrical()

  console.log("\n=== Seed complete ===")
  console.log("3 businesses | 27 invoices | 21 email logs | all statuses covered")
  console.log("")
  console.log("NOTE: Supabase Auth users are NOT created by this script.")
  console.log("      The seed user_profiles use synthetic UUIDs that will not")
  console.log("      match any real auth.users entry. To test sign-in flows,")
  console.log("      create auth users manually (see docs/preview-seed-data.md).")
  console.log("")
  console.log("Run `npm run verify-seed` to confirm the seed data is in place.")
}

main()
  .catch((err) => {
    console.error("Seed failed:", err)
    process.exit(1)
  })
  .finally(() => prismaAdmin.$disconnect())
