/**
 * scripts/seed-preview.ts
 *
 * Seeds the local / preview database with a realistic Australian small-business
 * data set so every major PaidSoon workflow can be exercised through the UI
 * without hand-creating records.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SAFETY GATES
 * ─────────────────────────────────────────────────────────────────────────────
 * The script refuses to run unless:
 *   1. SEED_ENV is explicitly one of: local | preview | development | test
 *   2. DATABASE_URL does not contain obvious production project identifiers
 *
 * It exits 1 (loudly) if SEED_ENV is "production"/"prod", unset, or unknown.
 *
 * No seeded record can trigger real outbound activity:
 *   - Every client and login address uses a reserved `.test` domain, and
 *     `lib/email/deliveryGuard.ts` blocks delivery to reserved domains before
 *     any Resend call is made.
 *   - Seeded accounting connections carry a reserved `demo-seed:` organisation
 *     id; `lib/providers/accounting/demoGuard.ts` makes both the per-connection
 *     sync and the cron fan-out skip them, and their stored "tokens" are inert
 *     placeholder strings that are not valid ciphertext.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IDEMPOTENCY
 * ─────────────────────────────────────────────────────────────────────────────
 * Seed accounts are identified by their reserved `.test` email addresses. On
 * each run the script resolves those to auth user ids, deletes every row owned
 * by them (FK-safe order), then recreates the data set. Re-running is always
 * safe and never touches records belonging to anyone else.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DATES
 * ─────────────────────────────────────────────────────────────────────────────
 * All dates are computed relative to a reference day in Australia/Melbourne.
 * Set SEED_REFERENCE_DATE=YYYY-MM-DD to pin it; otherwise the current Melbourne
 * calendar day is used, so ageing buckets stay meaningful on every run.
 *
 * Usage:
 *   npm run db:seed
 *   SEED_REFERENCE_DATE=2026-07-25 npm run db:seed
 */

// Load env BEFORE importing anything that reads process.env at module init.
import "./_loadEnv"

import { prismaAdmin } from "../lib/db/admin"
import { findOrCreateCustomer } from "../lib/db/customers"
import { upsertFinancialInvoice } from "../lib/financial/ingest"
import { Prisma } from "../lib/generated/prisma/client"
import { DEMO_ORGANISATION_ID_PREFIX } from "../lib/providers/accounting/demoGuard"
import { detectSpendFindings } from "../lib/spendleak/engine"
import {
  createSeedClock,
  resolveSeedReferenceDate,
  SEED_TIME_ZONE,
  type SeedClock,
} from "./seed/referenceDate"
import {
  DEFAULT_SEED_PASSWORD,
  provisionSeedAuthUsers,
  type ProvisionedAuthUser,
} from "./seed/authUsers"

// ---------------------------------------------------------------------------
// Environment safety check
// ---------------------------------------------------------------------------

const ALLOWED_SEED_ENVS = new Set(["local", "preview", "development", "test"])
const BLOCKED_SEED_ENVS = new Set(["production", "prod"])

function checkEnvironment(): void {
  const seedEnv = process.env.SEED_ENV?.toLowerCase().trim()

  if (!seedEnv) {
    console.error("ERROR: SEED_ENV is not set.")
    console.error("Set SEED_ENV=local (or preview / development / test) before running this script.")
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

  const dbUrl = (process.env.DATABASE_URL ?? "").toLowerCase()
  if (!dbUrl) {
    console.error("ERROR: DATABASE_URL is not set.")
    process.exit(1)
  }

  const prodMarkers = ["paidsoon-prod", "-prod.", ".prod.", "paidsoon_prod"]
  for (const marker of prodMarkers) {
    if (dbUrl.includes(marker)) {
      console.error("ERROR: DATABASE_URL appears to reference a production database.")
      console.error("Verify your .env.local points to the paidsoon-dev project, then retry.")
      process.exit(1)
    }
  }

  console.log(`Environment check passed. SEED_ENV="${seedEnv}"`)
}

// ---------------------------------------------------------------------------
// Seed accounts
//
// PaidSoon has no organisation / membership model: a tenant IS a Supabase auth
// user, and every row is scoped by `userId` with RLS enforcing `auth.uid()`.
// "Organisation" below therefore means "one account = one signed-in user".
// ---------------------------------------------------------------------------

const ACCOUNTS = {
  /** Primary demo account — Small Business tier, full entitlements, substantial data. */
  owner: {
    key: "owner",
    email: "owner@coastline-demo.test",
    displayName: "Danielle Whitcombe",
    businessName: "Coastline Plumbing & Gas Pty Ltd",
    tier: "small_business",
  },
  /**
   * Second team member. PaidSoon has no seats/roles model, so the closest
   * supported analogue is a separate Starter-tier account for the bookkeeper —
   * which also makes plan-entitlement gating (no custom templates, no AI
   * rewrite, no verified custom from-domain) directly testable. Starter now
   * includes accounting integrations and promise-to-pay tracking, since those
   * are part of the core follow-up promise available on every paid tier.
   */
  bookkeeper: {
    key: "bookkeeper",
    email: "bookkeeper@coastline-demo.test",
    displayName: "Marcus Petrides",
    businessName: "Coastline Plumbing — Bookkeeping",
    tier: "essentials",
  },
  /** Second organisation — small data set, used for tenant-isolation / RLS testing. */
  secondOrg: {
    key: "secondOrg",
    email: "owner@yarravalley-demo.test",
    displayName: "Priya Raghavan",
    businessName: "Yarra Valley Web Studio",
    tier: "small_business",
  },
} as const

type AccountKey = keyof typeof ACCOUNTS

/**
 * User ids used by earlier revisions of this seed. Still cleaned up so an older
 * seeded database converges on the current data set rather than accumulating.
 */
const LEGACY_SEED_USER_IDS = [
  "5eed0001-0000-4000-8000-000000000001",
  "5eed0002-0000-4000-8000-000000000002",
  "5eed0003-0000-4000-8000-000000000003",
]

// ---------------------------------------------------------------------------
// Money helpers — AUD, GST 10%, amounts stored in cents (GST inclusive)
// ---------------------------------------------------------------------------

const GST_RATE = 0.1
const CURRENCY = "aud"

/** Convert dollars to cents. */
function aud(dollars: number): number {
  return Math.round(dollars * 100)
}

/**
 * GST breakdown for a GST-inclusive total, in cents.
 *
 * `tracked_invoices` has no tax columns, so the split is recorded in
 * `provider_metadata` (a provider-scoped JSON blob) for reference. It is not
 * surfaced by the UI — see docs/preview-seed-data.md § Schema gaps.
 */
function gstBreakdown(totalIncGstCents: number) {
  const exGst = Math.round(totalIncGstCents / (1 + GST_RATE))
  return {
    currency: "AUD",
    taxCode: "GST",
    rate: GST_RATE,
    exGstCents: exGst,
    gstCents: totalIncGstCents - exGst,
    incGstCents: totalIncGstCents,
  }
}

interface LineItem {
  description: string
  quantity: number
  unitPriceExGstCents: number
}

function lineItems(items: LineItem[]) {
  return items.map((item) => ({
    ...item,
    lineTotalExGstCents: item.quantity * item.unitPriceExGstCents,
  }))
}

// ---------------------------------------------------------------------------
// Invoice scenario definitions
// ---------------------------------------------------------------------------

type InvoiceStatus =
  | "pending"
  | "paid"
  | "paused"
  | "snoozed"
  | "sequence_complete"
  | "manually_resolved"

interface InvoiceSpec {
  /** Stable slug — becomes part of `externalId`, so re-runs are deterministic. */
  slug: string
  scenario: string
  clientName: string
  clientEmail: string
  /** GST-inclusive amount still owing, in cents. */
  amountDue: number
  /** Days relative to the reference day. Negative = overdue. */
  dueInDays: number
  status: InvoiceStatus
  /** Reminder emails already sent (drives currentStage and email_logs). */
  remindersSent?: 0 | 1 | 2 | 3
  /** Days from reference until the next reminder. `null`/omitted = none scheduled. */
  nextEmailInDays?: number | null
  /** Days from reference until an active snooze expires. */
  snoozedUntilDays?: number
  /** Which invoice connection to attach the invoice to. */
  connection?: "stripe" | "myob" | "xero"
  /** Extra `provider_metadata` merged over the GST + line-item defaults. */
  metadata?: Record<string, unknown>
  lines: LineItem[]
  /** Generate a promise-to-pay client token (Business+ only). */
  withP2PToken?: boolean
  /** Marks the most recent reminder as having no confirmed delivery. */
  lastReminderUndelivered?: boolean
}

const STAGE_SUBJECTS: Record<1 | 2 | 3, (business: string) => string> = {
  1: (b) => `Friendly reminder: your invoice from ${b} is now due`,
  2: (b) => `Second notice: your invoice from ${b} remains unpaid`,
  3: (b) => `Final notice: immediate payment required — ${b}`,
}

// ---------------------------------------------------------------------------
// Primary demo account — Coastline Plumbing & Gas Pty Ltd
// ---------------------------------------------------------------------------

const COASTLINE_INVOICES: InvoiceSpec[] = [
  {
    slug: "hawthorn-fitout",
    scenario: "New invoice, not yet due",
    clientName: "Hawthorn Property Group",
    clientEmail: "accounts@hawthornproperty.example.test",
    amountDue: aud(1320),
    dueInDays: 12,
    status: "pending",
    remindersSent: 0,
    lines: [
      { description: "Hot water unit replacement — 250L", quantity: 1, unitPriceExGstCents: aud(940) },
      { description: "Labour — licensed plumber (4 hrs)", quantity: 4, unitPriceExGstCents: aud(60) },
    ],
  },
  {
    slug: "brunswick-fitout",
    scenario: "Invoice due today",
    clientName: "Brunswick Fitout Co",
    clientEmail: "payables@brunswickfitout.example.test",
    amountDue: aud(2145),
    dueInDays: 0,
    status: "pending",
    remindersSent: 0,
    nextEmailInDays: 3,
    lines: [
      { description: "Commercial kitchen rough-in", quantity: 1, unitPriceExGstCents: aud(1500) },
      { description: "Backflow prevention device + test", quantity: 1, unitPriceExGstCents: aud(450) },
    ],
  },
  {
    slug: "preston-cafe",
    scenario: "Overdue ~3 days, first reminder sent",
    clientName: "Preston Cafe Fitouts",
    clientEmail: "admin@prestoncafefitouts.example.test",
    amountDue: aud(748),
    dueInDays: -3,
    status: "pending",
    remindersSent: 1,
    nextEmailInDays: 7,
    lines: [{ description: "Grease trap service call", quantity: 1, unitPriceExGstCents: aud(680) }],
  },
  {
    slug: "docklands-fm",
    scenario: "Overdue ~7 days, next reminder scheduled",
    clientName: "Docklands Facilities Management",
    clientEmail: "ap@docklandsfm.example.test",
    amountDue: aud(3410),
    dueInDays: -7,
    status: "pending",
    remindersSent: 1,
    nextEmailInDays: 3,
    lines: [
      { description: "Quarterly plumbing maintenance — Tower B", quantity: 1, unitPriceExGstCents: aud(2400) },
      { description: "Emergency leak response (after hours)", quantity: 1, unitPriceExGstCents: aud(700) },
    ],
  },
  {
    slug: "northcote-dental",
    scenario: "Overdue ~14 days, reminder due now (cron queue)",
    clientName: "Northcote Dental Studio",
    clientEmail: "accounts@northcotedental.example.test",
    amountDue: aud(1595),
    dueInDays: -14,
    status: "pending",
    remindersSent: 1,
    // A full day in the past, so the reminder queue always has a due item no
    // matter what time of day the seed or the cron job runs. The delivery
    // guard suppresses the actual send (`.test` recipient).
    nextEmailInDays: -1,
    lines: [
      { description: "Sterilisation room water line install", quantity: 1, unitPriceExGstCents: aud(1450) },
    ],
  },
  {
    slug: "werribee-logistics",
    scenario: "Overdue ~30 days, second reminder sent",
    clientName: "Werribee Logistics Pty Ltd",
    clientEmail: "finance@werribeelogistics.example.test",
    amountDue: aud(5280),
    dueInDays: -30,
    status: "pending",
    remindersSent: 2,
    nextEmailInDays: 1,
    lines: [
      { description: "Warehouse amenities upgrade", quantity: 1, unitPriceExGstCents: aud(4200) },
      { description: "Trade waste compliance certificate", quantity: 1, unitPriceExGstCents: aud(600) },
    ],
  },
  {
    slug: "sunshine-metal",
    scenario: "Seriously overdue (~72 days), reminder sequence exhausted",
    clientName: "Sunshine Metal Works",
    clientEmail: "accounts@sunshinemetalworks.example.test",
    amountDue: aud(9845),
    dueInDays: -72,
    status: "sequence_complete",
    remindersSent: 3,
    nextEmailInDays: null,
    lines: [
      { description: "Factory gas line installation", quantity: 1, unitPriceExGstCents: aud(7800) },
      { description: "Compliance certification and testing", quantity: 1, unitPriceExGstCents: aud(1150) },
    ],
  },
  {
    slug: "fitzroy-bakehouse",
    scenario: "Partially paid — balance outstanding",
    clientName: "Fitzroy Bakehouse",
    clientEmail: "owner@fitzroybakehouse.example.test",
    amountDue: aud(2500),
    dueInDays: -21,
    status: "pending",
    remindersSent: 2,
    nextEmailInDays: 4,
    metadata: {
      originalTotalIncGstCents: aud(4400),
      amountPaidCents: aud(1900),
      payments: [
        { reference: "EFT-88213", amountCents: aud(1900), method: "bank_transfer", daysBeforeReference: 12 },
      ],
    },
    lines: [
      { description: "Oven gas connection and certification", quantity: 1, unitPriceExGstCents: aud(2600) },
      { description: "Floor waste relocation", quantity: 1, unitPriceExGstCents: aud(1400) },
    ],
  },
  {
    slug: "camberwell-strata",
    scenario: "Paid in full",
    clientName: "Camberwell Strata Services",
    clientEmail: "accounts@camberwellstrata.example.test",
    amountDue: aud(2860),
    dueInDays: -18,
    status: "paid",
    remindersSent: 1,
    nextEmailInDays: null,
    metadata: {
      amountPaidCents: aud(2860),
      payments: [
        { reference: "EFT-77410", amountCents: aud(2860), method: "bank_transfer", daysBeforeReference: 15 },
      ],
    },
    lines: [{ description: "Common-property pipe relining (Block C)", quantity: 1, unitPriceExGstCents: aud(2600) }],
  },
  {
    slug: "geelong-roofing",
    scenario: "Paid via multiple part-payments",
    clientName: "Geelong Roofing & Guttering",
    clientEmail: "accounts@geelongroofing.example.test",
    amountDue: aud(8800),
    dueInDays: -40,
    status: "paid",
    remindersSent: 2,
    nextEmailInDays: null,
    metadata: {
      amountPaidCents: aud(8800),
      payments: [
        { reference: "EFT-70918", amountCents: aud(3000), method: "bank_transfer", daysBeforeReference: 33 },
        { reference: "EFT-71544", amountCents: aud(3000), method: "bank_transfer", daysBeforeReference: 21 },
        { reference: "EFT-72301", amountCents: aud(2800), method: "bank_transfer", daysBeforeReference: 9 },
      ],
    },
    lines: [
      { description: "Stormwater downpipe replacement — 12 units", quantity: 12, unitPriceExGstCents: aud(540) },
      { description: "Site attendance and disposal", quantity: 1, unitPriceExGstCents: aud(1520) },
    ],
  },
  // Customer with several outstanding invoices ------------------------------
  {
    slug: "yarraville-01",
    scenario: "Multi-invoice customer (1 of 3) — recently overdue",
    clientName: "Yarraville Developments",
    clientEmail: "payables@yarravilledev.example.test",
    amountDue: aud(1100),
    dueInDays: -5,
    status: "pending",
    remindersSent: 1,
    nextEmailInDays: 5,
    lines: [{ description: "Site amenities connection — Stage 1", quantity: 1, unitPriceExGstCents: aud(1000) }],
  },
  {
    slug: "yarraville-02",
    scenario: "Multi-invoice customer (2 of 3) — under a partial-payment arrangement",
    clientName: "Yarraville Developments",
    clientEmail: "payables@yarravilledev.example.test",
    amountDue: aud(6600),
    dueInDays: -19,
    status: "snoozed",
    remindersSent: 2,
    snoozedUntilDays: 10,
    nextEmailInDays: 10,
    lines: [
      { description: "Sewer connection — Stage 2", quantity: 1, unitPriceExGstCents: aud(5000) },
      { description: "Council inspection attendance", quantity: 2, unitPriceExGstCents: aud(500) },
    ],
  },
  {
    slug: "yarraville-03",
    scenario: "Multi-invoice customer (3 of 3) — not yet due",
    clientName: "Yarraville Developments",
    clientEmail: "payables@yarravilledev.example.test",
    amountDue: aud(2200),
    dueInDays: 9,
    status: "pending",
    remindersSent: 0,
    lines: [{ description: "Stage 3 rough-in progress claim", quantity: 1, unitPriceExGstCents: aud(2000) }],
  },
  {
    slug: "airport-retail",
    scenario: "High-value overdue invoice",
    clientName: "Melbourne Airport Retail Holdings",
    clientEmail: "accountspayable@melbairportretail.example.test",
    amountDue: aud(48730),
    dueInDays: -26,
    status: "pending",
    remindersSent: 2,
    nextEmailInDays: 2,
    lines: [
      { description: "Terminal 3 food court plumbing fitout", quantity: 1, unitPriceExGstCents: aud(38000) },
      { description: "Grease arrestor supply and install", quantity: 2, unitPriceExGstCents: aud(3200) },
      { description: "Out-of-hours labour loading", quantity: 1, unitPriceExGstCents: aud(1900) },
    ],
  },
  // Promise to pay ----------------------------------------------------------
  {
    slug: "ringwood-auto",
    scenario: "Active promise to pay — reminders suppressed",
    clientName: "Ringwood Auto Group",
    clientEmail: "finance@ringwoodauto.example.test",
    amountDue: aud(3960),
    dueInDays: -16,
    status: "snoozed",
    remindersSent: 1,
    snoozedUntilDays: 6,
    nextEmailInDays: 6,
    withP2PToken: true,
    lines: [{ description: "Workshop wash bay drainage", quantity: 1, unitPriceExGstCents: aud(3600) }],
  },
  {
    slug: "sunbury-landscaping",
    scenario: "Broken promise to pay — escalated back into the sequence",
    clientName: "Sunbury Landscaping",
    clientEmail: "office@sunburylandscaping.example.test",
    amountDue: aud(2475),
    dueInDays: -34,
    status: "pending",
    remindersSent: 2,
    nextEmailInDays: 1,
    withP2PToken: true,
    lines: [{ description: "Irrigation backflow install and test", quantity: 1, unitPriceExGstCents: aud(2250) }],
  },
  {
    slug: "essendon-signage",
    scenario: "Kept promise to pay — invoice settled",
    clientName: "Essendon Signage Group",
    clientEmail: "accounts@essendonsignage.example.test",
    amountDue: aud(1265),
    dueInDays: -29,
    status: "paid",
    remindersSent: 1,
    nextEmailInDays: null,
    withP2PToken: true,
    metadata: {
      amountPaidCents: aud(1265),
      payments: [
        { reference: "EFT-69220", amountCents: aud(1265), method: "bank_transfer", daysBeforeReference: 8 },
      ],
    },
    lines: [{ description: "Amenities block plumbing repair", quantity: 1, unitPriceExGstCents: aud(1150) }],
  },
  // Disputes and pauses -----------------------------------------------------
  {
    slug: "southbank-tower",
    scenario: "Disputed invoice — collections frozen",
    clientName: "Southbank Tower Services",
    clientEmail: "disputes@southbanktower.example.test",
    amountDue: aud(7150),
    dueInDays: -23,
    status: "paused",
    remindersSent: 1,
    nextEmailInDays: null,
    metadata: {
      dispute: {
        raisedDaysBeforeReference: 9,
        reason: "Client disputes the after-hours labour loading on lines 3–4.",
        state: "under_review",
      },
    },
    lines: [
      { description: "Riser main repair — Levels 8–12", quantity: 1, unitPriceExGstCents: aud(4800) },
      { description: "After-hours labour loading", quantity: 1, unitPriceExGstCents: aud(1700) },
    ],
  },
  {
    slug: "altona-cold-storage",
    scenario: "Collection activity paused — payment hardship",
    clientName: "Altona Cold Storage",
    clientEmail: "accounts@altonacoldstorage.example.test",
    amountDue: aud(1870),
    dueInDays: -11,
    status: "paused",
    remindersSent: 1,
    nextEmailInDays: null,
    metadata: {
      collectionPause: {
        reason: "Client requested a two-week hold while an insurance claim is assessed.",
        pausedDaysBeforeReference: 4,
      },
    },
    lines: [{ description: "Cool room condensate line repair", quantity: 1, unitPriceExGstCents: aud(1700) }],
  },
  {
    slug: "croydon-community",
    scenario: "Excluded from automatic reminders (manual follow-up only)",
    clientName: "Croydon Community Centre",
    clientEmail: "finance@croydoncommunity.example.test",
    amountDue: aud(990),
    dueInDays: -9,
    status: "pending",
    remindersSent: 0,
    nextEmailInDays: null,
    metadata: {
      automationExcluded: true,
      note: "Not-for-profit client — the owner follows these up by phone.",
    },
    lines: [{ description: "Accessible bathroom tap replacement", quantity: 3, unitPriceExGstCents: aud(300) }],
  },
  {
    slug: "reservoir-tyre",
    scenario: "Reminder sent but delivery not confirmed",
    clientName: "Reservoir Tyre Centre",
    clientEmail: "bounce@reservoirtyre.example.test",
    amountDue: aud(1430),
    dueInDays: -13,
    status: "pending",
    remindersSent: 1,
    nextEmailInDays: 6,
    lastReminderUndelivered: true,
    metadata: {
      deliveryIssue: {
        stage: 1,
        detail: "Provider returned a hard bounce: recipient mailbox does not exist.",
      },
    },
    lines: [{ description: "Compressor water separator install", quantity: 1, unitPriceExGstCents: aud(1300) }],
  },
  {
    slug: "keilor-mowing",
    scenario: "Customer without a usable email address",
    clientName: "Keilor Downs Mowing",
    clientEmail: "no-email-on-file@unreachable.example.test",
    amountDue: aud(605),
    dueInDays: -8,
    status: "pending",
    remindersSent: 0,
    nextEmailInDays: null,
    metadata: {
      contactIssue: "No billing email on file — placeholder address, reminders cannot be sent.",
      preferredContact: "phone",
    },
    lines: [{ description: "Outdoor tap and hose reel install", quantity: 1, unitPriceExGstCents: aud(550) }],
  },
  {
    slug: "moorabbin-hire",
    scenario: "Archived / inactive customer — written off",
    clientName: "Moorabbin Hire (ceased trading)",
    clientEmail: "accounts@moorabbinhire.example.test",
    amountDue: aud(1155),
    dueInDays: -118,
    status: "manually_resolved",
    remindersSent: 3,
    nextEmailInDays: null,
    metadata: {
      archived: true,
      resolution: "written_off",
      note: "Business deregistered — debt written off, customer archived.",
    },
    lines: [{ description: "Depot amenities repair", quantity: 1, unitPriceExGstCents: aud(1050) }],
  },
  // MYOB-imported invoices --------------------------------------------------
  {
    slug: "dandenong-freight",
    scenario: "Instalment-plan arrangement in progress (MYOB import)",
    clientName: "Dandenong Freight Services",
    clientEmail: "accounts@dandenongfreight.example.test",
    amountDue: aud(12100),
    dueInDays: -28,
    status: "snoozed",
    remindersSent: 2,
    snoozedUntilDays: 14,
    nextEmailInDays: 14,
    connection: "myob",
    lines: [
      { description: "Depot wash bay and trade waste works", quantity: 1, unitPriceExGstCents: aud(9500) },
      { description: "Trade waste agreement application", quantity: 1, unitPriceExGstCents: aud(1500) },
    ],
  },
  {
    slug: "broadmeadows-panel",
    scenario: "Broken arrangement — back in collections (MYOB import)",
    clientName: "Broadmeadows Panel & Paint",
    clientEmail: "admin@broadmeadowspanel.example.test",
    amountDue: aud(3300),
    dueInDays: -47,
    status: "pending",
    remindersSent: 2,
    nextEmailInDays: 2,
    connection: "myob",
    lines: [{ description: "Spray booth water supply upgrade", quantity: 1, unitPriceExGstCents: aud(3000) }],
  },
  {
    slug: "bendigo-childcare",
    scenario: "Recently imported from MYOB, not yet due",
    clientName: "Bendigo Early Learning",
    clientEmail: "accounts@bendigoearlylearning.example.test",
    amountDue: aud(1782),
    dueInDays: 21,
    status: "pending",
    remindersSent: 0,
    connection: "myob",
    lines: [{ description: "Tempering valve compliance upgrade", quantity: 6, unitPriceExGstCents: aud(270) }],
  },
]

// ---------------------------------------------------------------------------
// Bookkeeper account (Starter tier — restricted entitlements)
// ---------------------------------------------------------------------------

const BOOKKEEPER_INVOICES: InvoiceSpec[] = [
  {
    slug: "bk-clifton-hill",
    scenario: "Starter tier — overdue, first reminder sent",
    clientName: "Clifton Hill Cellars",
    clientEmail: "accounts@cliftonhillcellars.example.test",
    amountDue: aud(869),
    dueInDays: -6,
    status: "pending",
    remindersSent: 1,
    nextEmailInDays: 8,
    lines: [{ description: "Bookkeeping — June quarter", quantity: 1, unitPriceExGstCents: aud(790) }],
  },
  {
    slug: "bk-thornbury",
    scenario: "Starter tier — not yet due",
    clientName: "Thornbury Physio",
    clientEmail: "admin@thornburyphysio.example.test",
    amountDue: aud(495),
    dueInDays: 15,
    status: "pending",
    remindersSent: 0,
    nextEmailInDays: 18,
    lines: [{ description: "BAS preparation and lodgement", quantity: 1, unitPriceExGstCents: aud(450) }],
  },
  {
    slug: "bk-coburg",
    scenario: "Starter tier — paid",
    clientName: "Coburg Tiling",
    clientEmail: "accounts@coburgtiling.example.test",
    amountDue: aud(330),
    dueInDays: -20,
    status: "paid",
    remindersSent: 0,
    lines: [{ description: "Payroll processing — monthly", quantity: 1, unitPriceExGstCents: aud(300) }],
  },
  // ---------------------------------------------------------------------
  // Chase-volume allowance demo: Starter's monthly allowance is 10. The 9
  // invoices below plus bk-clifton-hill above bring this account's chased
  // count for the current (deterministic, see subscriptionCurrentPeriodStart
  // above) period to exactly 10 — i.e. at capacity — so bk-preston-held
  // below demonstrates the held-for-allowance state on the dashboard. See
  // openspec/changes/monthly-chase-volume-limits.
  // ---------------------------------------------------------------------
  {
    slug: "bk-cap-01",
    scenario: "Starter tier — at-capacity filler, first reminder sent",
    clientName: "Brunswick East Yoga",
    clientEmail: "accounts@brunswickeastyoga.example.test",
    amountDue: aud(210),
    dueInDays: -2,
    status: "pending",
    remindersSent: 1,
    nextEmailInDays: 12,
    lines: [{ description: "Bookkeeping — monthly retainer", quantity: 1, unitPriceExGstCents: aud(190) }],
  },
  {
    slug: "bk-cap-02",
    scenario: "Starter tier — at-capacity filler, first reminder sent",
    clientName: "Northcote Bike Co",
    clientEmail: "accounts@northcotebikeco.example.test",
    amountDue: aud(245),
    dueInDays: -3,
    status: "pending",
    remindersSent: 1,
    nextEmailInDays: 11,
    lines: [{ description: "Bookkeeping — monthly retainer", quantity: 1, unitPriceExGstCents: aud(225) }],
  },
  {
    slug: "bk-cap-03",
    scenario: "Starter tier — at-capacity filler, first reminder sent",
    clientName: "Preston Market Deli",
    clientEmail: "accounts@prestonmarketdeli.example.test",
    amountDue: aud(180),
    dueInDays: -4,
    status: "pending",
    remindersSent: 1,
    nextEmailInDays: 10,
    lines: [{ description: "BAS preparation and lodgement", quantity: 1, unitPriceExGstCents: aud(160) }],
  },
  {
    slug: "bk-cap-04",
    scenario: "Starter tier — at-capacity filler, first reminder sent",
    clientName: "Reservoir Auto Electrical",
    clientEmail: "accounts@reservoirautoelectrical.example.test",
    amountDue: aud(390),
    dueInDays: -5,
    status: "pending",
    remindersSent: 1,
    nextEmailInDays: 9,
    lines: [{ description: "Payroll processing — monthly", quantity: 1, unitPriceExGstCents: aud(360) }],
  },
  {
    slug: "bk-cap-05",
    scenario: "Starter tier — at-capacity filler, first reminder sent",
    clientName: "Fairfield Osteopathy",
    clientEmail: "admin@fairfieldosteo.example.test",
    amountDue: aud(275),
    dueInDays: -6,
    status: "pending",
    remindersSent: 1,
    nextEmailInDays: 8,
    lines: [{ description: "BAS preparation and lodgement", quantity: 1, unitPriceExGstCents: aud(250) }],
  },
  {
    slug: "bk-cap-06",
    scenario: "Starter tier — at-capacity filler, first reminder sent",
    clientName: "Ivanhoe Physio Group",
    clientEmail: "accounts@ivanhoephysio.example.test",
    amountDue: aud(330),
    dueInDays: -7,
    status: "pending",
    remindersSent: 1,
    nextEmailInDays: 7,
    lines: [{ description: "Bookkeeping — monthly retainer", quantity: 1, unitPriceExGstCents: aud(300) }],
  },
  {
    slug: "bk-cap-07",
    scenario: "Starter tier — at-capacity filler, first reminder sent",
    clientName: "Alphington Landscaping",
    clientEmail: "accounts@alphingtonlandscaping.example.test",
    amountDue: aud(420),
    dueInDays: -8,
    status: "pending",
    remindersSent: 1,
    nextEmailInDays: 6,
    lines: [{ description: "Payroll processing — monthly", quantity: 1, unitPriceExGstCents: aud(390) }],
  },
  {
    slug: "bk-cap-08",
    scenario: "Starter tier — at-capacity filler, first reminder sent",
    clientName: "Kew East Dental",
    clientEmail: "accounts@keweastdental.example.test",
    amountDue: aud(510),
    dueInDays: -9,
    status: "pending",
    remindersSent: 1,
    nextEmailInDays: 5,
    lines: [{ description: "BAS preparation and lodgement", quantity: 1, unitPriceExGstCents: aud(470) }],
  },
  {
    slug: "bk-cap-09",
    scenario: "Starter tier — at-capacity filler, first reminder sent",
    clientName: "Eltham Ceramics Studio",
    clientEmail: "accounts@elthamceramics.example.test",
    amountDue: aud(295),
    dueInDays: -10,
    status: "pending",
    remindersSent: 1,
    nextEmailInDays: 4,
    lines: [{ description: "Bookkeeping — monthly retainer", quantity: 1, unitPriceExGstCents: aud(270) }],
  },
  {
    slug: "bk-preston-held",
    scenario: "Starter tier — held for allowance: account at capacity, first reminder due now",
    clientName: "Preston Panelbeaters",
    clientEmail: "accounts@prestonpanelbeaters.example.test",
    amountDue: aud(560),
    dueInDays: -5,
    status: "pending",
    remindersSent: 0,
    // In the past, so this is always overdue for its first reminder — the
    // cron holds it (currentStage 0, account at capacity) rather than
    // sending, and the dashboard labels it "Held — allowance".
    nextEmailInDays: -1,
    lines: [{ description: "Bookkeeping — monthly retainer", quantity: 1, unitPriceExGstCents: aud(510) }],
  },
]

// ---------------------------------------------------------------------------
// Second organisation (tenant isolation / RLS testing)
// ---------------------------------------------------------------------------

const YARRA_VALLEY_INVOICES: InvoiceSpec[] = [
  {
    slug: "yv-healesville",
    scenario: "Second tenant — overdue ~7 days",
    clientName: "Healesville Winery Tours",
    clientEmail: "accounts@healesvilletours.example.test",
    amountDue: aud(2310),
    dueInDays: -7,
    status: "pending",
    remindersSent: 1,
    nextEmailInDays: 4,
    connection: "xero",
    lines: [{ description: "Booking site redesign — milestone 2", quantity: 1, unitPriceExGstCents: aud(2100) }],
  },
  {
    slug: "yv-warburton",
    scenario: "Second tenant — active promise to pay",
    clientName: "Warburton Trail Cabins",
    clientEmail: "hello@warburtoncabins.example.test",
    amountDue: aud(1595),
    dueInDays: -15,
    status: "snoozed",
    remindersSent: 1,
    snoozedUntilDays: 5,
    nextEmailInDays: 5,
    connection: "xero",
    withP2PToken: true,
    lines: [{ description: "Booking engine integration", quantity: 1, unitPriceExGstCents: aud(1450) }],
  },
  {
    slug: "yv-lilydale",
    scenario: "Second tenant — paid",
    clientName: "Lilydale Garden Supplies",
    clientEmail: "accounts@lilydalegarden.example.test",
    amountDue: aud(3960),
    dueInDays: -22,
    status: "paid",
    remindersSent: 0,
    connection: "xero",
    metadata: {
      amountPaidCents: aud(3960),
      payments: [
        { reference: "EFT-51002", amountCents: aud(3960), method: "bank_transfer", daysBeforeReference: 19 },
      ],
    },
    lines: [{ description: "E-commerce catalogue build", quantity: 1, unitPriceExGstCents: aud(3600) }],
  },
  {
    slug: "yv-yarraglen",
    scenario: "Second tenant — not yet due",
    clientName: "Yarra Glen Produce Market",
    clientEmail: "office@yarraglenproduce.example.test",
    amountDue: aud(880),
    dueInDays: 18,
    status: "pending",
    remindersSent: 0,
    lines: [{ description: "Monthly hosting and support retainer", quantity: 1, unitPriceExGstCents: aud(800) }],
  },
]

// ---------------------------------------------------------------------------
// Cleanup — removes ALL rows owned by the seed accounts (FK-safe order)
// ---------------------------------------------------------------------------

async function cleanup(userIds: string[]): Promise<void> {
  console.log("\nCleaning up existing seed data…")

  // Resolve seed-owned parent ids first. Child rows are then deleted by BOTH
  // their own userId AND these parent ids, because a child's ownership can drift
  // (e.g. reassigned by hand in Prisma Studio) while it still holds an FK to a
  // seed-owned parent — which would otherwise strand the parent on delete.
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

  if (invoiceIds.length > 0) {
    await prismaAdmin.emailLog.deleteMany({ where: { trackedInvoiceId: { in: invoiceIds } } })
    await prismaAdmin.promiseToPay.deleteMany({ where: { trackedInvoiceId: { in: invoiceIds } } })
  }
  await prismaAdmin.promiseToPay.deleteMany({ where: { userId: { in: userIds } } })

  if (invoiceIds.length > 0 || arrangementIds.length > 0) {
    await prismaAdmin.arrangementInvoiceCoverage.deleteMany({
      where: {
        OR: [{ trackedInvoiceId: { in: invoiceIds } }, { arrangementId: { in: arrangementIds } }],
      },
    })
  }
  if (accountingConnectionIds.length > 0) {
    await prismaAdmin.accountingSyncRun.deleteMany({
      where: { accountingConnectionId: { in: accountingConnectionIds } },
    })
  }

  await prismaAdmin.spendInsight.deleteMany({
    where: {
      OR: [{ userId: { in: userIds } }, { accountingConnectionId: { in: accountingConnectionIds } }],
    },
  })
  await prismaAdmin.ownersDigestDelivery.deleteMany({ where: { userId: { in: userIds } } })
  await prismaAdmin.ownersDigestProviderRun.deleteMany({ where: { userId: { in: userIds } } })
  await prismaAdmin.ownersDigestMetric.deleteMany({ where: { userId: { in: userIds } } })
  await prismaAdmin.ownersDigestItem.deleteMany({ where: { userId: { in: userIds } } })
  await prismaAdmin.ownersDigestSnapshot.deleteMany({ where: { userId: { in: userIds } } })
  await prismaAdmin.ownersDigestSetting.deleteMany({ where: { userId: { in: userIds } } })

  await prismaAdmin.commitmentEvent.deleteMany({ where: { userId: { in: userIds } } })
  await prismaAdmin.commitmentDetectionCandidate.deleteMany({ where: { userId: { in: userIds } } })
  await prismaAdmin.commitment.deleteMany({ where: { userId: { in: userIds } } })
  await prismaAdmin.commitGuardSetting.deleteMany({ where: { userId: { in: userIds } } })

  await prismaAdmin.runwayGuardAlertEvent.deleteMany({ where: { userId: { in: userIds } } })
  await prismaAdmin.runwayGuardAlert.deleteMany({ where: { userId: { in: userIds } } })
  await prismaAdmin.runwayGuardSnapshot.deleteMany({ where: { userId: { in: userIds } } })
  await prismaAdmin.runwayGuardScenario.deleteMany({ where: { userId: { in: userIds } } })
  await prismaAdmin.runwayGuardSetting.deleteMany({ where: { userId: { in: userIds } } })

  await prismaAdmin.costGuardAlertEvent.deleteMany({ where: { userId: { in: userIds } } })
  await prismaAdmin.costGuardAlert.deleteMany({ where: { userId: { in: userIds } } })
  await prismaAdmin.costGuardForecast.deleteMany({ where: { userId: { in: userIds } } })
  await prismaAdmin.costGuardBaseline.deleteMany({ where: { userId: { in: userIds } } })
  await prismaAdmin.costGuardRule.deleteMany({ where: { userId: { in: userIds } } })
  await prismaAdmin.costGuardSetting.deleteMany({ where: { userId: { in: userIds } } })

  await prismaAdmin.taxBufferEvent.deleteMany({ where: { userId: { in: userIds } } })
  await prismaAdmin.taxBufferOverride.deleteMany({ where: { userId: { in: userIds } } })
  await prismaAdmin.taxBufferSnapshot.deleteMany({ where: { userId: { in: userIds } } })
  await prismaAdmin.taxBufferObligation.deleteMany({ where: { userId: { in: userIds } } })
  await prismaAdmin.taxReserveCategory.deleteMany({ where: { userId: { in: userIds } } })
  await prismaAdmin.taxBufferConfiguration.deleteMany({ where: { userId: { in: userIds } } })

  await prismaAdmin.cashPlanDataQualityIssue.deleteMany({ where: { userId: { in: userIds } } })
  await prismaAdmin.cashPlanAlert.deleteMany({ where: { userId: { in: userIds } } })
  await prismaAdmin.cashPlanSetting.deleteMany({ where: { userId: { in: userIds } } })
  await prismaAdmin.cashPlan.deleteMany({ where: { userId: { in: userIds } } })

  await prismaAdmin.marginAlertEvent.deleteMany({ where: { userId: { in: userIds } } })
  await prismaAdmin.marginAlert.deleteMany({ where: { userId: { in: userIds } } })
  await prismaAdmin.marginOpportunity.deleteMany({ where: { userId: { in: userIds } } })
  await prismaAdmin.marginSnapshot.deleteMany({ where: { userId: { in: userIds } } })
  await prismaAdmin.marginScenario.deleteMany({ where: { userId: { in: userIds } } })
  await prismaAdmin.marginCostClassification.deleteMany({ where: { userId: { in: userIds } } })
  await prismaAdmin.marginClassificationRule.deleteMany({ where: { userId: { in: userIds } } })
  await prismaAdmin.marginGuardTarget.deleteMany({ where: { userId: { in: userIds } } })
  await prismaAdmin.marginGuardSetting.deleteMany({ where: { userId: { in: userIds } } })
  await prismaAdmin.cashForecastSnapshot.deleteMany({
    where: {
      OR: [{ userId: { in: userIds } }, { accountingConnectionId: { in: accountingConnectionIds } }],
    },
  })
  await prismaAdmin.importedBankTransaction.deleteMany({
    where: {
      OR: [{ userId: { in: userIds } }, { accountingConnectionId: { in: accountingConnectionIds } }],
    },
  })
  await prismaAdmin.importedBill.deleteMany({
    where: {
      OR: [{ userId: { in: userIds } }, { accountingConnectionId: { in: accountingConnectionIds } }],
    },
  })
  await prismaAdmin.supplierProfile.deleteMany({
    where: {
      OR: [{ userId: { in: userIds } }, { accountingConnectionId: { in: accountingConnectionIds } }],
    },
  })

  if (invoiceIds.length > 0) {
    await prismaAdmin.trackedInvoice.deleteMany({ where: { id: { in: invoiceIds } } })
  }
  await prismaAdmin.customer.deleteMany({ where: { userId: { in: userIds } } })
  await prismaAdmin.financialPayment.deleteMany({ where: { userId: { in: userIds } } })
  await prismaAdmin.financialInvoice.deleteMany({ where: { userId: { in: userIds } } })
  await prismaAdmin.financialContact.deleteMany({ where: { userId: { in: userIds } } })
  await prismaAdmin.emailSettings.deleteMany({ where: { userId: { in: userIds } } })
  await prismaAdmin.schedule.deleteMany({ where: { userId: { in: userIds } } })
  await prismaAdmin.emailTemplate.deleteMany({ where: { userId: { in: userIds } } })
  await prismaAdmin.promiseEscalationPolicy.deleteMany({ where: { userId: { in: userIds } } })
  await prismaAdmin.arrangement.deleteMany({ where: { userId: { in: userIds } } })
  await prismaAdmin.accountingConnection.deleteMany({ where: { userId: { in: userIds } } })
  await prismaAdmin.invoiceConnection.deleteMany({ where: { userId: { in: userIds } } })
  await prismaAdmin.oauthState.deleteMany({ where: { userId: { in: userIds } } })
  // AiUsageLog cascades via its UserProfile FK (onDelete: Cascade).

  await prismaAdmin.userProfile.deleteMany({ where: { userId: { in: userIds } } })

  console.log(`  ✓ Cleared data for ${userIds.length} seed account id(s)`)
}

// ---------------------------------------------------------------------------
// Invoice creation
// ---------------------------------------------------------------------------

interface CreatedInvoice {
  id: string
  slug: string
  clientEmail: string
  clientName: string
  amountDue: number
}

interface SeedCounters {
  invoices: number
  emailLogs: number
  promises: number
  arrangements: number
  syncRuns: number
  mappings: number
  spendBills: number
  spendTransactions: number
  spendSuppliers: number
  spendInsights: number
  cashSnapshots: number
  marginSnapshots: number
  marginAlerts: number
  marginOpportunities: number
  cashPlans: number
  cashPlanAlerts: number
  runwaySnapshots: number
  runwayAlerts: number
  costGuardForecasts: number
  costGuardAlerts: number
  taxCategories: number
  taxObligations: number
  taxEvents: number
  taxSnapshots: number
  commitments: number
  commitmentCandidates: number
  ownersDigestSnapshots: number
  ownersDigestItems: number
}

/** Deterministic, obviously-fake token (never a real credential). */
function demoToken(kind: string, slug: string): string {
  return `demo-seed-${kind}-${slug}-not-a-real-token`
}

function stableP2PToken(slug: string): string {
  return `demoseedp2p${slug.replace(/[^a-z0-9]/g, "")}`.padEnd(48, "0").slice(0, 64)
}

interface SpendLeakBillSpec {
  sourceId: string
  supplierSourceId: string
  supplierName: string
  amountCents: number
  dueInDays: number
  status: "open" | "paid"
}

interface SpendLeakTransactionSpec {
  sourceId: string
  amountCents: number
  description: string
  counterpartyName: string
  daysAgo: number
}

interface SpendLeakSupplierSpec {
  sourceId: string
  supplierName: string
  supplierEmail: string
  paymentTerms: string
  defaultAccountCode: string
  defaultAccountName: string
}

function spendLeakSeedData(profile: "coastline" | "yarra") {
  if (profile === "coastline") {
    const suppliers: SpendLeakSupplierSpec[] = [
      {
        sourceId: "coast-supplier-metro-saas",
        supplierName: "Metro SaaS Systems",
        supplierEmail: "billing@metrosaas.example.test",
        paymentTerms: "Due in 14 days",
        defaultAccountCode: "621",
        defaultAccountName: "Software subscriptions",
      },
      {
        sourceId: "coast-supplier-fleetfuel",
        supplierName: "FleetFuel Card Services",
        supplierEmail: "accounts@fleetfuel.example.test",
        paymentTerms: "Due on receipt",
        defaultAccountCode: "646",
        defaultAccountName: "Vehicle fuel",
      },
      {
        sourceId: "coast-supplier-lease",
        supplierName: "Office Lease Group",
        supplierEmail: "receivables@officelease.example.test",
        paymentTerms: "Net 30",
        defaultAccountCode: "690",
        defaultAccountName: "Rent",
      },
    ]

    const bills: SpendLeakBillSpec[] = [
      {
        sourceId: "coast-bill-metro-jan",
        supplierSourceId: "coast-supplier-metro-saas",
        supplierName: "Metro SaaS Systems",
        amountCents: 420_000,
        dueInDays: -60,
        status: "paid",
      },
      {
        sourceId: "coast-bill-metro-feb",
        supplierSourceId: "coast-supplier-metro-saas",
        supplierName: "Metro SaaS Systems",
        amountCents: 420_000,
        dueInDays: -30,
        status: "paid",
      },
      {
        sourceId: "coast-bill-metro-renewal",
        supplierSourceId: "coast-supplier-metro-saas",
        supplierName: "Metro SaaS Systems",
        amountCents: 420_000,
        dueInDays: 2,
        status: "open",
      },
      {
        sourceId: "coast-bill-fleetfuel-mar",
        supplierSourceId: "coast-supplier-fleetfuel",
        supplierName: "FleetFuel Card Services",
        amountCents: 95_000,
        dueInDays: -35,
        status: "paid",
      },
      {
        sourceId: "coast-bill-fleetfuel-apr",
        supplierSourceId: "coast-supplier-fleetfuel",
        supplierName: "FleetFuel Card Services",
        amountCents: 97_000,
        dueInDays: -5,
        status: "open",
      },
      {
        sourceId: "coast-bill-office-lease",
        supplierSourceId: "coast-supplier-lease",
        supplierName: "Office Lease Group",
        amountCents: 210_000,
        dueInDays: 14,
        status: "open",
      },
    ]

    const bankTransactions: SpendLeakTransactionSpec[] = [
      {
        sourceId: "coast-txn-metro-feb",
        amountCents: -420_000,
        description: "Metro SaaS Systems monthly platform charge",
        counterpartyName: "Metro SaaS Systems",
        daysAgo: 30,
      },
      {
        sourceId: "coast-txn-fleetfuel",
        amountCents: -97_000,
        description: "FleetFuel card settlement",
        counterpartyName: "FleetFuel Card Services",
        daysAgo: 5,
      },
      {
        sourceId: "coast-txn-payroll",
        amountCents: -315_000,
        description: "Payroll clearing",
        counterpartyName: "Coastline Payroll",
        daysAgo: 4,
      },
      {
        sourceId: "coast-txn-insurance",
        amountCents: -215_000,
        description: "Business insurance premium",
        counterpartyName: "AUS Trade Insurance",
        daysAgo: 9,
      },
    ]

    return {
      suppliers,
      bills,
      bankTransactions,
      syncedAt: (clock: SeedClock) => clock.hoursAgo(6),
      cashSnapshot: {
        currentCashCents: 1_940_000,
        receivablesCents: 8_120_000,
        payablesCents: 1_192_000,
        predictedMonthEndCents: 1_280_000,
        runwayDays: 46,
      },
    }
  }

  const suppliers: SpendLeakSupplierSpec[] = [
    {
      sourceId: "yarra-supplier-cloud-host",
      supplierName: "CloudHost Managed Services",
      supplierEmail: "billing@cloudhost.example.test",
      paymentTerms: "Net 14",
      defaultAccountCode: "621",
      defaultAccountName: "Software subscriptions",
    },
    {
      sourceId: "yarra-supplier-freelancer",
      supplierName: "Valley Contract Developers",
      supplierEmail: "finance@valleydevs.example.test",
      paymentTerms: "Net 7",
      defaultAccountCode: "670",
      defaultAccountName: "Contractors",
    },
  ]

  const bills: SpendLeakBillSpec[] = [
    {
      sourceId: "yarra-bill-cloudhost-mar",
      supplierSourceId: "yarra-supplier-cloud-host",
      supplierName: "CloudHost Managed Services",
      amountCents: 245_000,
      dueInDays: -55,
      status: "paid",
    },
    {
      sourceId: "yarra-bill-cloudhost-apr",
      supplierSourceId: "yarra-supplier-cloud-host",
      supplierName: "CloudHost Managed Services",
      amountCents: 248_000,
      dueInDays: -26,
      status: "paid",
    },
    {
      sourceId: "yarra-bill-cloudhost-renewal",
      supplierSourceId: "yarra-supplier-cloud-host",
      supplierName: "CloudHost Managed Services",
      amountCents: 248_000,
      dueInDays: 4,
      status: "open",
    },
    {
      sourceId: "yarra-bill-contractor",
      supplierSourceId: "yarra-supplier-freelancer",
      supplierName: "Valley Contract Developers",
      amountCents: 95_000,
      dueInDays: -8,
      status: "open",
    },
  ]

  const bankTransactions: SpendLeakTransactionSpec[] = [
    {
      sourceId: "yarra-txn-cloudhost",
      amountCents: -248_000,
      description: "CloudHost recurring invoice payment",
      counterpartyName: "CloudHost Managed Services",
      daysAgo: 26,
    },
    {
      sourceId: "yarra-txn-contractor",
      amountCents: -95_000,
      description: "Contractor milestone payment",
      counterpartyName: "Valley Contract Developers",
      daysAgo: 8,
    },
  ]

  return {
    suppliers,
    bills,
    bankTransactions,
    syncedAt: (clock: SeedClock) => clock.daysAgo(3),
    cashSnapshot: {
      currentCashCents: 590_000,
      receivablesCents: 2_430_000,
      payablesCents: 836_000,
      predictedMonthEndCents: 440_000,
      runwayDays: 31,
    },
  }
}

async function seedSpendLeakFoundation(
  userId: string,
  accountingConnectionId: string,
  profile: "coastline" | "yarra",
  clock: SeedClock,
  counters: SeedCounters,
): Promise<void> {
  const dataset = spendLeakSeedData(profile)
  const syncedAt = dataset.syncedAt(clock)

  await prismaAdmin.supplierProfile.createMany({
    data: dataset.suppliers.map((supplier) => ({
      userId,
      accountingConnectionId,
      sourceId: supplier.sourceId,
      supplierName: supplier.supplierName,
      supplierEmail: supplier.supplierEmail,
      paymentTerms: supplier.paymentTerms,
      defaultAccountCode: supplier.defaultAccountCode,
      defaultAccountName: supplier.defaultAccountName,
      sourceUpdatedAt: clock.daysAgo(1),
      syncedAt,
      rawSourceData: {
        source: "seed",
        profile,
      },
    })),
  })
  counters.spendSuppliers += dataset.suppliers.length

  await prismaAdmin.importedBill.createMany({
    data: dataset.bills.map((bill) => ({
      userId,
      accountingConnectionId,
      sourceId: bill.sourceId,
      sourceContactId: bill.supplierSourceId,
      supplierName: bill.supplierName,
      supplierReference: `${bill.sourceId.toUpperCase()}-REF`,
      documentNumber: bill.sourceId.toUpperCase().replace(/[^A-Z0-9]/g, ""),
      expenseAccountCode: "621",
      expenseAccountName: "Software subscriptions",
      amountCents: bill.amountCents,
      gstCents: Math.round(bill.amountCents / 11),
      currency: CURRENCY.toUpperCase(),
      dueDate: clock.daysFromNow(bill.dueInDays),
      paidDate: bill.status === "paid" ? clock.daysFromNow(Math.min(-1, bill.dueInDays + 1)) : null,
      status: bill.status,
      sourceUpdatedAt: clock.daysAgo(1),
      syncedAt,
      rawSourceData: {
        source: "seed",
        profile,
      },
    })),
  })
  counters.spendBills += dataset.bills.length

  await prismaAdmin.importedBankTransaction.createMany({
    data: dataset.bankTransactions.map((tx) => ({
      userId,
      accountingConnectionId,
      sourceId: tx.sourceId,
      accountName: "Business Transaction Account",
      accountCode: "090",
      description: tx.description,
      counterpartyName: tx.counterpartyName,
      amountCents: tx.amountCents,
      currency: CURRENCY.toUpperCase(),
      transactionDate: clock.daysAgo(tx.daysAgo),
      sourceUpdatedAt: clock.daysAgo(1),
      syncedAt,
      rawSourceData: {
        source: "seed",
        profile,
      },
    })),
  })
  counters.spendTransactions += dataset.bankTransactions.length

  const generatedFindings = detectSpendFindings({
    now: syncedAt,
    bills: dataset.bills.map((bill) => ({
      sourceId: bill.sourceId,
      supplierName: bill.supplierName,
      amountCents: bill.amountCents,
      dueDate: clock.daysFromNow(bill.dueInDays),
      paidDate: bill.status === "paid" ? clock.daysFromNow(Math.min(-1, bill.dueInDays + 1)) : null,
      status: bill.status,
      sourceUpdatedAt: clock.daysAgo(1),
    })),
    bankTransactions: dataset.bankTransactions.map((tx) => ({
      sourceId: tx.sourceId,
      description: tx.description,
      amountCents: tx.amountCents,
      transactionDate: clock.daysAgo(tx.daysAgo),
      counterpartyName: tx.counterpartyName,
    })),
    suppliers: dataset.suppliers.map((supplier) => ({
      sourceId: supplier.sourceId,
      supplierName: supplier.supplierName,
    })),
  })

  await prismaAdmin.spendInsight.createMany({
    data: generatedFindings.map((finding) => ({
      userId,
      accountingConnectionId,
      findingType: finding.findingType,
      subjectKey: finding.subjectKey,
      severity: finding.severity,
      summary: finding.summary,
      state: finding.state,
      estimatedMonthlyCents: finding.estimatedMonthlyCents ?? null,
      estimatedAnnualCents: finding.estimatedAnnualCents ?? null,
      evidence: finding.evidence as Prisma.InputJsonValue,
      detectedAt: finding.detectedAt,
      resolvedAt: null,
    })),
  })
  counters.spendInsights += generatedFindings.length

  await prismaAdmin.cashForecastSnapshot.create({
    data: {
      userId,
      accountingConnectionId,
      currentCashCents: dataset.cashSnapshot.currentCashCents,
      receivablesCents: dataset.cashSnapshot.receivablesCents,
      payablesCents: dataset.cashSnapshot.payablesCents,
      predictedMonthEndCents: dataset.cashSnapshot.predictedMonthEndCents,
      runwayDays: dataset.cashSnapshot.runwayDays,
      assumptions: {
        source: "seed",
        profile,
        methodology: "deterministic-development-fixture",
      },
      snapshotAt: syncedAt,
      createdAt: syncedAt,
    },
  })
  counters.cashSnapshots += 1
}

async function seedMarginGuardFoundation(
  userId: string,
  profile: "coastline" | "yarra",
  clock: SeedClock,
  counters: SeedCounters,
): Promise<void> {
  await prismaAdmin.marginGuardSetting.create({
    data: {
      userId,
      enabled: true,
      defaultPeriod: "3m",
      targetGrossMarginPercent: profile === "coastline" ? 38 : 35,
      warningGrossMarginPercent: profile === "coastline" ? 33 : 31,
      criticalGrossMarginPercent: profile === "coastline" ? 28 : 27,
      minCompletenessPercent: 70,
      alertDigestMode: "weekly",
    },
  })

  await prismaAdmin.marginGuardTarget.create({
    data: {
      userId,
      scopeType: "organization",
      scopeKey: null,
      targetGrossMarginPercent: profile === "coastline" ? 38 : 35,
      warningGrossMarginPercent: profile === "coastline" ? 33 : 31,
      criticalGrossMarginPercent: profile === "coastline" ? 28 : 27,
      createdBy: "seed-preview",
      updatedBy: "seed-preview",
    },
  })

  const focusEmails = profile === "coastline"
    ? [
        "accounts@camberwellstrata.example.test",
        "ap@docklandsfm.example.test",
        "accounts@sunshinemetalworks.example.test",
      ]
    : [
        "accounts@healesvilleretreat.example.test",
        "finance@warburtonadventure.example.test",
      ]

  const contacts = await prismaAdmin.financialContact.findMany({
    where: {
      userId,
      emailLower: { in: focusEmails },
    },
    select: { id: true, emailLower: true },
  })

  const byEmail = new Map(contacts.map((contact) => [contact.emailLower ?? "", contact.id]))

  const scopedTargets = profile === "coastline"
    ? [
        { email: "accounts@camberwellstrata.example.test", target: 42, warning: 37, critical: 32 },
        { email: "ap@docklandsfm.example.test", target: 36, warning: 31, critical: 27 },
        { email: "accounts@sunshinemetalworks.example.test", target: 34, warning: 28, critical: 24 },
      ]
    : [
        { email: "accounts@healesvilleretreat.example.test", target: 37, warning: 32, critical: 28 },
        { email: "finance@warburtonadventure.example.test", target: 35, warning: 30, critical: 26 },
      ]

  for (const target of scopedTargets) {
    const contactId = byEmail.get(target.email)
    if (!contactId) continue

    await prismaAdmin.marginGuardTarget.create({
      data: {
        userId,
        scopeType: "customer",
        scopeKey: contactId,
        targetGrossMarginPercent: target.target,
        warningGrossMarginPercent: target.warning,
        criticalGrossMarginPercent: target.critical,
        createdBy: "seed-preview",
        updatedBy: "seed-preview",
      },
    })
  }

  const snapshotRows = profile === "coastline"
    ? [
        {
          periodStart: clock.startOfDay(-90),
          periodEnd: clock.endOfDay(-61),
          revenueCents: 1_320_000,
          directCostCents: 765_000,
          variableCostCents: 132_000,
          grossProfitCents: 555_000,
          grossMarginPercent: 42,
          completenessPercent: 92,
          confidence: "high",
          status: "healthy",
        },
        {
          periodStart: clock.startOfDay(-60),
          periodEnd: clock.endOfDay(-31),
          revenueCents: 1_410_000,
          directCostCents: 965_000,
          variableCostCents: 151_000,
          grossProfitCents: 445_000,
          grossMarginPercent: 31.56,
          completenessPercent: 84,
          confidence: "medium",
          status: "watch",
        },
        {
          periodStart: clock.startOfDay(-30),
          periodEnd: clock.endOfDay(-1),
          revenueCents: 1_370_000,
          directCostCents: 975_000,
          variableCostCents: 179_000,
          grossProfitCents: 395_000,
          grossMarginPercent: 28.83,
          completenessPercent: 74,
          confidence: "medium",
          status: "critical",
        },
      ]
    : [
        {
          periodStart: clock.startOfDay(-30),
          periodEnd: clock.endOfDay(-1),
          revenueCents: 486_000,
          directCostCents: 296_000,
          variableCostCents: 44_000,
          grossProfitCents: 190_000,
          grossMarginPercent: 39.09,
          completenessPercent: 88,
          confidence: "high",
          status: "healthy",
        },
      ]

  const createdSnapshots = [] as Array<{ id: string; status: string }>
  for (const row of snapshotRows) {
    const snapshot = await prismaAdmin.marginSnapshot.create({
      data: {
        userId,
        periodGranularity: "monthly",
        periodStart: row.periodStart,
        periodEnd: row.periodEnd,
        currency: CURRENCY,
        revenueCents: row.revenueCents,
        directCostCents: row.directCostCents,
        variableCostCents: row.variableCostCents,
        grossProfitCents: row.grossProfitCents,
        grossMarginPercent: row.grossMarginPercent,
        contributionMarginCents: row.revenueCents - row.variableCostCents,
        contributionMarginPercent: Number((((row.revenueCents - row.variableCostCents) / row.revenueCents) * 100).toFixed(2)),
        completenessPercent: row.completenessPercent,
        confidence: row.confidence,
        status: row.status,
        assumptions: {
          source: "seed-preview",
          profile,
          includesDeteriorationSeries: profile === "coastline",
        },
        calculatedAt: row.periodEnd,
      },
    })
    createdSnapshots.push({ id: snapshot.id, status: row.status })
    counters.marginSnapshots += 1
  }

  await prismaAdmin.marginCostClassification.createMany({
    data: [
      {
        userId,
        sourceType: "imported_bill",
        sourceRecordId: `${profile}-marginguard-uncategorized-bill-1`,
        classification: "UNCLASSIFIED",
        classificationOrigin: "default",
        confidence: "low",
        metadata: {
          source: "seed-preview",
          reason: "awaiting category review",
        } as Prisma.InputJsonValue,
      },
      {
        userId,
        sourceType: "imported_bank_transaction",
        sourceRecordId: `${profile}-marginguard-uncategorized-txn-1`,
        classification: "UNCLASSIFIED",
        classificationOrigin: "default",
        confidence: "low",
        metadata: {
          source: "seed-preview",
          reason: "counterparty mapping missing",
        } as Prisma.InputJsonValue,
      },
      {
        userId,
        sourceType: "imported_bill",
        sourceRecordId: `${profile}-marginguard-directcost-bill-1`,
        classification: "DIRECT_COST",
        classificationOrigin: "rule",
        confidence: "high",
        metadata: {
          source: "seed-preview",
          ruleName: "Material and freight baseline",
        } as Prisma.InputJsonValue,
      },
    ],
  })

  const latestSnapshot = createdSnapshots[createdSnapshots.length - 1]
  if (latestSnapshot && profile === "coastline") {
    const criticalAlert = await prismaAdmin.marginAlert.create({
      data: {
        userId,
        marginSnapshotId: latestSnapshot.id,
        alertType: "margin.below_critical",
        scopeType: "organization",
        scopeKey: null,
        severity: "critical",
        status: "open",
        title: "Gross margin below critical threshold",
        message: "Monthly gross margin has dropped below the configured critical threshold.",
        evidence: {
          source: "seed-preview",
          profile,
          grossMarginPercent: 28.83,
          criticalThreshold: 28,
        } as Prisma.InputJsonValue,
        estimatedImpactCents: 124_000,
        confidence: "medium",
        detectedAt: clock.daysAgo(2),
      },
    })

    await prismaAdmin.marginAlertEvent.create({
      data: {
        userId,
        marginAlertId: criticalAlert.id,
        eventType: "created",
        actorId: "seed-preview",
        newStatus: "open",
        metadata: {
          source: "seed-preview",
        } as Prisma.InputJsonValue,
      },
    })

    await prismaAdmin.marginAlert.create({
      data: {
        userId,
        marginSnapshotId: latestSnapshot.id,
        alertType: "margin.deterioration",
        scopeType: "organization",
        scopeKey: null,
        severity: "warning",
        status: "acknowledged",
        title: "Gross margin deteriorating period-over-period",
        message: "Gross margin has fallen for two consecutive monthly snapshots.",
        evidence: {
          source: "seed-preview",
          profile,
          trend: [42, 31.56, 28.83],
        } as Prisma.InputJsonValue,
        confidence: "medium",
        detectedAt: clock.daysAgo(4),
        acknowledgedAt: clock.daysAgo(3),
      },
    })

    counters.marginAlerts += 2

    await prismaAdmin.marginOpportunity.createMany({
      data: [
        {
          userId,
          opportunityType: "pricing",
          scopeType: "customer",
          scopeKey: byEmail.get("accounts@sunshinemetalworks.example.test") ?? null,
          severity: "critical",
          status: "open",
          title: "Reprice high-effort fixed-fee work",
          description: "Sunshine Metal Works jobs are consuming disproportionate direct costs compared to billed revenue.",
          evidence: {
            source: "seed-preview",
            customerStatus: "critical",
            action: "price review before next quote",
          } as Prisma.InputJsonValue,
          estimatedMonthlyCents: 45_000,
          estimatedAnnualCents: 540_000,
          confidence: "medium",
          detectedAt: clock.daysAgo(2),
        },
        {
          userId,
          opportunityType: "classification",
          scopeType: "organization",
          scopeKey: null,
          severity: "warning",
          status: "open",
          title: "Classify remaining spend records",
          description: "Unclassified spend items are lowering confidence in margin attribution.",
          evidence: {
            source: "seed-preview",
            unclassifiedCount: 2,
            action: "apply supplier rules",
          } as Prisma.InputJsonValue,
          estimatedMonthlyCents: null,
          estimatedAnnualCents: null,
          confidence: "medium",
          detectedAt: clock.daysAgo(1),
        },
      ],
    })
    counters.marginOpportunities += 2
  }
}

async function seedCashPlanFoundation(
  userId: string,
  profile: "coastline" | "yarra",
  clock: SeedClock,
  counters: SeedCounters,
): Promise<void> {
  const plan = await prismaAdmin.cashPlan.create({
    data: {
      userId,
      name: profile === "coastline" ? "Operating cash plan" : "Studio operating cash plan",
      currency: CURRENCY,
      timezone: SEED_TIME_ZONE,
      horizonWeeks: 13,
      bufferTargetCents: profile === "coastline" ? 180_000 : 120_000,
      status: profile === "coastline" ? "active" : "preliminary",
    },
  })
  counters.cashPlans += 1

  await prismaAdmin.cashPlanSetting.create({
    data: {
      userId,
      planId: plan.id,
      currency: CURRENCY,
      timezone: SEED_TIME_ZONE,
      horizonWeeks: 13,
      bufferTargetCents: profile === "coastline" ? 180_000 : 120_000,
      alertThresholdCents: profile === "coastline" ? 60_000 : 40_000,
      reviewRole: "owner",
    },
  })

  const baseScenario = await prismaAdmin.cashPlanScenario.create({
    data: {
      planId: plan.id,
      name: "Base",
      kind: "base",
      delta: { source: "seed-preview", profile } as Prisma.InputJsonValue,
      isActive: true,
    },
  })

  await prismaAdmin.cashPlanScenario.create({
    data: {
      planId: plan.id,
      name: profile === "coastline" ? "Collections slip" : "Seasonal softness",
      kind: "conservative",
      delta:
        profile === "coastline"
          ? ({ receivablesCollectionDelayDays: 14, variableSpendLiftPercent: 9 } as Prisma.InputJsonValue)
          : ({ receivablesCollectionDelayDays: 8, variableSpendLiftPercent: 6 } as Prisma.InputJsonValue),
      isActive: false,
    },
  })

  await prismaAdmin.cashPlanSnapshot.create({
    data: {
      planId: plan.id,
      scenarioId: baseScenario.id,
      inputHash: `seed-${profile}-cashplan-base`,
      engineVersion: "seed-v1",
      confidence: profile === "coastline" ? 86 : 82,
      status: profile === "coastline" ? "active" : "preliminary",
      lowestClosingCashCents: profile === "coastline" ? 165_000 : 101_000,
      bufferGapCents: profile === "coastline" ? 15_000 : 19_000,
      weeks:
        profile === "coastline"
          ? ([
              { week: 1, closingCashCents: 358_000 },
              { week: 6, closingCashCents: 248_000 },
              { week: 13, closingCashCents: 165_000 },
            ] as Prisma.InputJsonValue)
          : ([
              { week: 1, closingCashCents: 218_000 },
              { week: 6, closingCashCents: 154_000 },
              { week: 13, closingCashCents: 101_000 },
            ] as Prisma.InputJsonValue),
      createdAt: clock.daysAgo(1),
    },
  })

  await prismaAdmin.cashPlanOverride.create({
    data: {
      planId: plan.id,
      entityType: "outflow",
      entityId: `${profile}-cashplan-override-rent`,
      amountCents: profile === "coastline" ? 42_000 : 28_000,
      reason: "Known seasonal spend uplift included in forecast",
      owner: "seed-preview",
      effectiveFrom: clock.daysAgo(10),
      expiresAt: clock.daysFromNow(30),
      sourceType: "manual",
      createdBy: "seed-preview",
    },
  })

  await prismaAdmin.cashPlanAlert.create({
    data: {
      userId,
      planId: plan.id,
      alertType: "buffer_gap",
      severity: profile === "coastline" ? "medium" : "low",
      title: "Projected cash buffer below target",
      description: "Projected weekly closing cash drops below the configured buffer target.",
      status: profile === "coastline" ? "open" : "acknowledged",
      materialityCents: profile === "coastline" ? 15_000 : 19_000,
      triggeredAt: clock.daysAgo(2),
      acknowledgedAt: profile === "coastline" ? null : clock.daysAgo(1),
      metadata: { source: "seed-preview", profile } as Prisma.InputJsonValue,
    },
  })
  counters.cashPlanAlerts += 1

  await prismaAdmin.cashPlanDataQualityIssue.create({
    data: {
      userId,
      planId: plan.id,
      issueType: "missing_commitments",
      severity: "low",
      message: "Some recurring commitments are inferred but not yet confirmed.",
      status: "open",
      weekIndex: 4,
      metadata: { source: "seed-preview", profile } as Prisma.InputJsonValue,
    },
  })
}

async function seedRunwayGuardFoundation(
  userId: string,
  profile: "coastline" | "yarra",
  clock: SeedClock,
  counters: SeedCounters,
): Promise<void> {
  await prismaAdmin.runwayGuardSetting.create({
    data: {
      userId,
      enabled: true,
      horizonDays: 180,
      warningThresholdDays: profile === "coastline" ? 75 : 60,
      criticalThresholdDays: profile === "coastline" ? 45 : 35,
      lowConfidenceWeight: 0.6,
      minimumConfidence: 0.5,
      notificationDigestMode: "daily",
    },
  })

  const snapshot = await prismaAdmin.runwayGuardSnapshot.create({
    data: {
      userId,
      snapshotAt: clock.daysAgo(1),
      openingCashCents: profile === "coastline" ? 412_000 : 236_000,
      protectedCashCents: profile === "coastline" ? 180_000 : 120_000,
      usableCashCents: profile === "coastline" ? 232_000 : 116_000,
      runwayDays: profile === "coastline" ? 59 : 41,
      projectedExhaustionDay: profile === "coastline" ? 59 : 41,
      status: profile === "coastline" ? "watch" : "critical",
      source: "cashplan",
      confidence: profile === "coastline" ? 0.82 : 0.68,
      assumptions: { source: "seed-preview", profile } as Prisma.InputJsonValue,
      explainability:
        profile === "coastline"
          ? ({ dominantDriver: "receivables timing", fixedCostsCoverageDays: 63 } as Prisma.InputJsonValue)
          : ({ dominantDriver: "contractor outflows", fixedCostsCoverageDays: 44 } as Prisma.InputJsonValue),
    },
  })
  counters.runwaySnapshots += 1

  const alert = await prismaAdmin.runwayGuardAlert.create({
    data: {
      userId,
      runwaySnapshotId: snapshot.id,
      alertType: "runway_threshold_breach",
      severity: profile === "coastline" ? "warning" : "critical",
      status: profile === "coastline" ? "open" : "acknowledged",
      title: "Projected runway near threshold",
      message:
        profile === "coastline"
          ? "Runway is trending toward the warning threshold within the current horizon."
          : "Runway is below the critical threshold and needs immediate action.",
      materialityCents: profile === "coastline" ? 80_000 : 62_000,
      metadata: { source: "seed-preview", profile } as Prisma.InputJsonValue,
      triggeredAt: clock.daysAgo(1),
      acknowledgedAt: profile === "coastline" ? null : clock.daysAgo(1),
    },
  })
  counters.runwayAlerts += 1

  await prismaAdmin.runwayGuardAlertEvent.create({
    data: {
      userId,
      runwayAlertId: alert.id,
      eventType: "created",
      actorId: "seed-preview",
      newStatus: profile === "coastline" ? "open" : "acknowledged",
      reason: null,
      metadata: { source: "seed-preview", profile } as Prisma.InputJsonValue,
    },
  })
}

async function seedCostGuardFoundation(
  userId: string,
  profile: "coastline" | "yarra",
  clock: SeedClock,
  counters: SeedCounters,
): Promise<void> {
  await prismaAdmin.costGuardSetting.create({
    data: {
      userId,
      defaultLookbackDays: 180,
      materialityPercent: 20,
      materialityCents: profile === "coastline" ? 12_000 : 9_000,
      alertDigestMode: "daily",
    },
  })

  await prismaAdmin.costGuardRule.create({
    data: {
      userId,
      name: profile === "coastline" ? "Supplier spike monitor" : "Category spend monitor",
      ruleType: profile === "coastline" ? "supplier_increase" : "category_increase",
      percentageThreshold: profile === "coastline" ? 18 : 16,
      absoluteThresholdCents: profile === "coastline" ? 15_000 : 10_000,
      severity: "warning",
      enabled: true,
      createdBy: "seed-preview",
    },
  })

  await prismaAdmin.costGuardBaseline.create({
    data: {
      userId,
      baselineType: "supplier",
      supplierId: `${profile}-supplier-baseline-1`,
      categoryId: null,
      periodMonths: 6,
      averageAmountCents: profile === "coastline" ? 96_000 : 72_000,
      medianAmountCents: profile === "coastline" ? 94_000 : 70_000,
      minAmountCents: profile === "coastline" ? 75_000 : 58_000,
      maxAmountCents: profile === "coastline" ? 121_000 : 88_000,
      sampleCount: 18,
      confidence: profile === "coastline" ? 0.79 : 0.74,
      calculatedAt: clock.daysAgo(2),
    },
  })

  await prismaAdmin.costGuardForecast.create({
    data: {
      userId,
      forecastMonth: clock.startOfDay(0),
      actualSpendCents: profile === "coastline" ? 211_000 : 139_000,
      recurringCommitmentsCents: profile === "coastline" ? 87_000 : 63_000,
      expectedVariableSpendCents: profile === "coastline" ? 92_000 : 61_000,
      projectedMonthEndCents: profile === "coastline" ? 303_000 : 200_000,
      varianceAmountCents: profile === "coastline" ? 38_000 : 24_000,
      variancePercent: profile === "coastline" ? 14.3 : 13.6,
      confidence: profile === "coastline" ? 76 : 72,
      assumptions: { source: "seed-preview", profile } as Prisma.InputJsonValue,
    },
  })
  counters.costGuardForecasts += 1

  const alert = await prismaAdmin.costGuardAlert.create({
    data: {
      userId,
      alertType: "supplier_spike",
      supplierId: `${profile}-supplier-baseline-1`,
      categoryId: null,
      transactionId: null,
      severity: profile === "coastline" ? "warning" : "critical",
      score: profile === "coastline" ? 71 : 83,
      confidence: profile === "coastline" ? 0.74 : 0.69,
      title: "Spend variance above threshold",
      description: "Projected spend exceeds the configured baseline threshold.",
      baselineAmountCents: profile === "coastline" ? 96_000 : 72_000,
      actualAmountCents: profile === "coastline" ? 129_000 : 102_000,
      varianceAmountCents: profile === "coastline" ? 33_000 : 30_000,
      variancePercent: profile === "coastline" ? 34.38 : 41.67,
      status: "new",
      detectedAt: clock.daysAgo(1),
    },
  })
  counters.costGuardAlerts += 1

  await prismaAdmin.costGuardAlertEvent.create({
    data: {
      userId,
      alertId: alert.id,
      eventType: "created",
      actorId: "seed-preview",
      metadata: { source: "seed-preview", profile } as Prisma.InputJsonValue,
      createdAt: clock.daysAgo(1),
    },
  })
}

async function seedTaxBufferFoundation(
  userId: string,
  profile: "coastline" | "yarra",
  clock: SeedClock,
  counters: SeedCounters,
): Promise<void> {
  await prismaAdmin.taxBufferConfiguration.create({
    data: {
      userId,
      enabled: true,
      accountingBasis: "cash",
      businessType: profile === "coastline" ? "company" : "sole_trader",
      gstRegistered: true,
      gstFrequency: "quarterly",
      reserveHealthWatchThreshold: 0.9,
      reserveHealthCriticalThreshold: 0.7,
      reserveBalanceSource: "manual",
      reserveBalanceCents: profile === "coastline" ? 118_000 : 76_000,
      reserveAccountName: "Tax reserve",
    },
  })

  const gstCategory = await prismaAdmin.taxReserveCategory.create({
    data: {
      userId,
      categoryType: "gst",
      name: "GST reserve",
      description: "GST obligations based on current invoice and payment mix.",
      calculationMethod: "manual",
      recurrence: "quarterly",
      enabled: true,
      manualAmountCents: profile === "coastline" ? 43_000 : 26_000,
      sourcePreference: "manual",
      confidenceOverride: "medium",
      nextDueDate: clock.daysFromNow(27),
    },
  })

  const paygCategory = await prismaAdmin.taxReserveCategory.create({
    data: {
      userId,
      categoryType: "payg_withholding",
      name: "PAYG withholding reserve",
      calculationMethod: "manual",
      recurrence: "monthly",
      enabled: true,
      manualAmountCents: profile === "coastline" ? 18_000 : 12_000,
      sourcePreference: "manual",
      nextDueDate: clock.daysFromNow(21),
    },
  })
  counters.taxCategories += 2

  const gstObligation = await prismaAdmin.taxBufferObligation.create({
    data: {
      userId,
      reserveCategoryId: gstCategory.id,
      name: "Quarterly BAS payment",
      periodStart: clock.startOfDay(-90),
      periodEnd: clock.endOfDay(-1),
      dueDate: clock.daysFromNow(27),
      estimatedAmountCents: profile === "coastline" ? 48_000 : 29_000,
      reservedAmountCents: profile === "coastline" ? 38_000 : 22_000,
      source: "seed-preview",
      sourceDetail: "manual fixture",
      confidence: "medium",
      status: "short",
      calculatedAt: clock.daysAgo(1),
    },
  })

  await prismaAdmin.taxBufferObligation.create({
    data: {
      userId,
      reserveCategoryId: paygCategory.id,
      name: "Monthly PAYG withholding",
      dueDate: clock.daysFromNow(21),
      estimatedAmountCents: profile === "coastline" ? 17_000 : 11_000,
      reservedAmountCents: profile === "coastline" ? 17_000 : 11_000,
      source: "seed-preview",
      sourceDetail: "manual fixture",
      confidence: "high",
      status: "covered",
      calculatedAt: clock.daysAgo(1),
    },
  })
  counters.taxObligations += 2

  await prismaAdmin.taxBufferOverride.create({
    data: {
      userId,
      reserveCategoryId: gstCategory.id,
      obligationId: gstObligation.id,
      calculatedValueCents: profile === "coastline" ? 48_000 : 29_000,
      overrideValueCents: profile === "coastline" ? 45_000 : 27_000,
      reason: "Accountant estimate for accrued credits",
      basedOnAccountant: true,
      createdBy: "seed-preview",
    },
  })

  await prismaAdmin.taxBufferEvent.create({
    data: {
      userId,
      eventType: "tax_buffer_below_target",
      severity: profile === "coastline" ? "warning" : "critical",
      dedupeKey: `seed-${profile}-tax-below-target`,
      title: "Tax reserve below target",
      message: "Projected reserve is below required coverage for upcoming obligations.",
      metadata: { source: "seed-preview", profile } as Prisma.InputJsonValue,
      occurredAt: clock.daysAgo(1),
    },
  })
  counters.taxEvents += 1

  await prismaAdmin.taxBufferSnapshot.create({
    data: {
      userId,
      snapshotAt: clock.daysAgo(1),
      availableCashCents: profile === "coastline" ? 412_000 : 236_000,
      totalRequiredCents: profile === "coastline" ? 65_000 : 40_000,
      totalReservedCents: profile === "coastline" ? 55_000 : 33_000,
      reserveGapCents: profile === "coastline" ? 10_000 : 7_000,
      committedOutflowsCents: profile === "coastline" ? 28_000 : 19_000,
      safeToSpendCents: profile === "coastline" ? 329_000 : 177_000,
      healthStatus: "underfunded",
      warnings:
        profile === "coastline"
          ? (["GST reserve is below target"] as Prisma.InputJsonValue)
          : (["PAYG reserve coverage is thin"] as Prisma.InputJsonValue),
      calculationInputs: { source: "seed-preview", profile } as Prisma.InputJsonValue,
    },
  })
  counters.taxSnapshots += 1
}

async function seedCommitGuardFoundation(
  userId: string,
  profile: "coastline" | "yarra",
  clock: SeedClock,
  counters: SeedCounters,
): Promise<void> {
  await prismaAdmin.commitGuardSetting.create({
    data: {
      userId,
      enabled: true,
      defaultHorizonDays: 30,
      safetyBufferMode: "fixed_amount",
      safetyBufferFixedCents: profile === "coastline" ? 90_000 : 55_000,
      detectRecurringCommitments: true,
      detectionMinOccurrences: 3,
      detectionAmountVariancePercent: 12,
      detectionIntervalToleranceDays: 3,
      detectionConfidenceThreshold: "medium",
      alertCommitmentDueSoon: true,
      alertRenewalApproaching: true,
      alertNoticePeriodApproaching: true,
      alertCommitmentAmountChanged: true,
      alertCommitmentBufferLow: true,
      alertCommitmentShortfall: true,
      renewalWarningDays: [30, 14, 7] as Prisma.InputJsonValue,
    },
  })

  const commitment = await prismaAdmin.commitment.create({
    data: {
      userId,
      name: profile === "coastline" ? "Vehicle lease" : "Cloud hosting retainer",
      description: "Deterministic commitment fixture for seed environments.",
      category: "operations",
      amountCents: profile === "coastline" ? 24_900 : 16_500,
      currency: CURRENCY,
      frequency: "monthly",
      nextDueDate: clock.daysFromNow(8),
      startDate: clock.daysAgo(210),
      supplierName: profile === "coastline" ? "Fleet lease partner" : "CloudHost Managed Services",
      source: "system_inferred",
      status: "active",
      confidence: "high",
      noticePeriodDays: 30,
      renewalDate: clock.daysFromNow(95),
      autoRenew: true,
      cancellable: true,
      essentiality: "operational",
    },
  })
  counters.commitments += 1

  const candidate = await prismaAdmin.commitmentDetectionCandidate.create({
    data: {
      userId,
      name: profile === "coastline" ? "Workshop software stack" : "Contractor toolkit subscription",
      supplierName: profile === "coastline" ? "Metro SaaS Systems" : "Valley Contract Developers",
      category: "software",
      frequency: "monthly",
      typicalAmountCents: profile === "coastline" ? 13_800 : 9_400,
      currency: CURRENCY,
      source: "system_inferred",
      confidence: "medium",
      confidenceScore: profile === "coastline" ? 0.72 : 0.67,
      status: "pending",
      evidence: { source: "seed-preview", profile, samples: 4 } as Prisma.InputJsonValue,
      evidenceFingerprint: `seed-${profile}-commit-candidate-1`,
      firstDetectedAt: clock.daysAgo(16),
      lastDetectedAt: clock.daysAgo(2),
      nextSuggestedAt: clock.daysFromNow(7),
    },
  })
  counters.commitmentCandidates += 1

  await prismaAdmin.commitmentEvent.createMany({
    data: [
      {
        userId,
        commitmentId: commitment.id,
        detectionCandidateId: null,
        eventType: "commitment_due_soon",
        severity: "warning",
        dedupeKey: `seed-${profile}-commitment-due-soon`,
        title: "Commitment due soon",
        message: "A recurring commitment is due within 10 days.",
        actorId: "seed-preview",
        metadata: { source: "seed-preview", profile } as Prisma.InputJsonValue,
        occurredAt: clock.daysAgo(1),
      },
      {
        userId,
        commitmentId: null,
        detectionCandidateId: candidate.id,
        eventType: "detection_candidate_created",
        severity: "info",
        dedupeKey: `seed-${profile}-candidate-created`,
        title: "Recurring commitment candidate detected",
        message: "A recurring spend pattern is ready for review.",
        actorId: "seed-preview",
        metadata: { source: "seed-preview", profile } as Prisma.InputJsonValue,
        occurredAt: clock.daysAgo(2),
      },
    ],
  })
}

async function seedOwnersDigestFoundation(
  userId: string,
  profile: "coastline" | "yarra",
  clock: SeedClock,
  counters: SeedCounters,
): Promise<void> {
  await prismaAdmin.ownersDigestSetting.create({
    data: {
      userId,
      enabled: true,
      emailEnabled: true,
      frequency: "weekly",
      deliveryDay: "monday",
      deliveryTime: profile === "coastline" ? "07:00" : "08:00",
      timezone: SEED_TIME_ZONE,
      includeNeedsAttention: true,
      includeOpportunities: true,
      includePositiveChanges: true,
      includeKeyNumbers: true,
      maxActionItems: 5,
      minimumMaterialityCents: profile === "coastline" ? 10_000 : 8_000,
      sendWhenEmpty: true,
      recipientScope: "owner_only",
    },
  })

  const snapshot = await prismaAdmin.ownersDigestSnapshot.create({
    data: {
      userId,
      frequency: "weekly",
      periodLabel: profile === "coastline" ? "Collections pressure" : "Stability check",
      periodStart: clock.startOfDay(-7),
      periodEnd: clock.endOfDay(-1),
      status: profile === "coastline" ? "watch" : "healthy",
      summary:
        profile === "coastline"
          ? "Receivables remain healthy overall, but collections risk has increased for one high-value customer."
          : "Cash runway remains stable and tax buffer obligations are near target.",
      summaryMode: "deterministic",
      dataAsOf: clock.hoursAgo(8),
      generatedAt: clock.hoursAgo(8),
      generationSource: "scheduled",
      generationState: "complete",
      providerSuccessCount: 3,
      providerFailureCount: 0,
      providerStaleCount: 0,
      topAttentionCount: profile === "coastline" ? 2 : 1,
      opportunityCount: profile === "coastline" ? 2 : 1,
      positiveCount: profile === "coastline" ? 1 : 2,
      infoCount: 1,
      completenessStatus: "complete",
      completenessSummary: "All configured providers returned current data.",
      statusReason: profile === "coastline" ? "Margin deterioration trend" : "No critical issues",
      metadata: { source: "seed-preview", profile } as Prisma.InputJsonValue,
    },
  })
  counters.ownersDigestSnapshots += 1

  await prismaAdmin.ownersDigestItem.create({
    data: {
      userId,
      snapshotId: snapshot.id,
      source: "marginguard",
      signalType: "MARGIN_TREND",
      severity: profile === "coastline" ? "warning" : "info",
      priorityScore: profile === "coastline" ? 81 : 38,
      section: "needs_attention",
      sortOrder: 1,
      title:
        profile === "coastline"
          ? "Margin deterioration needs pricing review"
          : "Runway watchlist remains manageable",
      summary:
        profile === "coastline"
          ? "Two monthly periods show lower gross margin than target."
          : "Runway remains above the immediate critical floor but should be monitored.",
      whyItMatters: "Cash confidence is directly affected by sustained margin pressure.",
      financialImpactCents: profile === "coastline" ? 124_000 : 41_000,
      currentValue: profile === "coastline" ? 28.83 : 41,
      previousValue: profile === "coastline" ? 31.56 : 47,
      changeValue: profile === "coastline" ? -2.73 : -6,
      changePercent: profile === "coastline" ? -8.65 : -12.77,
      entityType: "organization",
      entityId: userId,
      entityName: profile === "coastline" ? "Coastline Plumbing & Gas" : "Yarra Valley Web Studio",
      recommendedAction: "Review top cost drivers and pricing assumptions this week.",
      actionUrl: "/dashboard/marginguard",
      contributingSources: ["marginguard", "cashplan"] as Prisma.InputJsonValue,
      metadata: { source: "seed-preview", profile } as Prisma.InputJsonValue,
      detectedAt: clock.daysAgo(1),
    },
  })
  counters.ownersDigestItems += 1

  await prismaAdmin.ownersDigestMetric.create({
    data: {
      userId,
      snapshotId: snapshot.id,
      metricKey: "runway_days",
      label: "Runway",
      section: "key_numbers",
      unit: "days",
      displayValue: profile === "coastline" ? "59 days" : "41 days",
      numericValue: profile === "coastline" ? 59 : 41,
      previousNumericValue: profile === "coastline" ? 63 : 45,
      changeNumericValue: -4,
      changePercent: profile === "coastline" ? -6.35 : -8.89,
      sortOrder: 1,
      metadata: { source: "seed-preview", profile } as Prisma.InputJsonValue,
    },
  })

  await prismaAdmin.ownersDigestProviderRun.createMany({
    data: [
      {
        userId,
        snapshotId: snapshot.id,
        source: "cashplan",
        status: "complete",
        signalCount: 2,
        surfacedCount: 1,
        stale: false,
        entitled: true,
        configured: true,
        available: true,
        dataAsOf: clock.hoursAgo(8),
        startedAt: clock.hoursAgo(8),
        completedAt: clock.hoursAgo(8),
        durationMs: 780,
        metadata: { source: "seed-preview", profile } as Prisma.InputJsonValue,
      },
      {
        userId,
        snapshotId: snapshot.id,
        source: "taxbuffer",
        status: "complete",
        signalCount: 1,
        surfacedCount: 1,
        stale: false,
        entitled: true,
        configured: true,
        available: true,
        dataAsOf: clock.hoursAgo(8),
        startedAt: clock.hoursAgo(8),
        completedAt: clock.hoursAgo(8),
        durationMs: 620,
        metadata: { source: "seed-preview", profile } as Prisma.InputJsonValue,
      },
    ],
  })

  await prismaAdmin.ownersDigestDelivery.create({
    data: {
      userId,
      snapshotId: snapshot.id,
      deliveryScope: "owner_only",
      channel: "email",
      status: "sent",
      recipientCount: 1,
      deliveryKey: `seed-${profile}-owners-digest-${clock.startOfDay(-7).toISOString().slice(0, 10)}`,
      messageId: `seed-${profile}-owners-digest-msg`,
      requestedAt: clock.hoursAgo(8),
      sentAt: clock.hoursAgo(8),
      metadata: { source: "seed-preview", profile } as Prisma.InputJsonValue,
    },
  })
}

async function createInvoices(
  userId: string,
  businessName: string,
  fromAddress: string,
  specs: InvoiceSpec[],
  connectionIds: Partial<Record<"stripe" | "myob" | "xero", string>>,
  clock: SeedClock,
  counters: SeedCounters,
): Promise<Map<string, CreatedInvoice>> {
  const created = new Map<string, CreatedInvoice>()

  for (const spec of specs) {
    const connectionKey = spec.connection ?? "stripe"
    const invoiceConnectionId = connectionIds[connectionKey]
    if (!invoiceConnectionId) {
      throw new Error(`Seed spec "${spec.slug}" references missing connection "${connectionKey}".`)
    }

    const remindersSent = spec.remindersSent ?? 0
    const dueDate = spec.dueInDays === 0 ? clock.endOfDay(0) : clock.daysFromNow(spec.dueInDays)

    const externalId =
      connectionKey === "myob"
        ? `MYOB-CPG-${spec.slug.toUpperCase().replace(/[^A-Z0-9]/g, "")}`
        : connectionKey === "xero"
          ? `XERO-INV-${spec.slug.toUpperCase().replace(/[^A-Z0-9]/g, "")}`
          : `seed-${spec.slug}`

    const customer = await findOrCreateCustomer(
      prismaAdmin,
      userId,
      spec.clientEmail,
      spec.clientName,
      connectionKey,
      externalId,
    )

    const { invoice: financialInvoice } = await upsertFinancialInvoice(prismaAdmin, {
      userId,
      sourceSystem: connectionKey,
      sourceId: externalId,
      contactId: customer.financialContactId,
      amountDueCents: spec.amountDue,
      currency: CURRENCY,
      dueDate,
      rawSourceData: {
        seedScenario: spec.scenario,
        timeZone: SEED_TIME_ZONE,
        gst: gstBreakdown(spec.amountDue),
        lineItems: lineItems(spec.lines),
        paymentTerms: "Net 14 days from invoice date",
        ...(spec.metadata ?? {}),
      },
    })

    const invoice = await prismaAdmin.trackedInvoice.create({
      data: {
        userId,
        invoiceConnectionId,
        financialInvoiceId: financialInvoice.id,
        customerId: customer.id,
        status: spec.status,
        currentStage: remindersSent,
        nextEmailAt:
          spec.nextEmailInDays === null || spec.nextEmailInDays === undefined
            ? null
            : clock.daysFromNow(spec.nextEmailInDays),
        snoozedUntil:
          spec.snoozedUntilDays === undefined ? null : clock.daysFromNow(spec.snoozedUntilDays),
        p2pToken: spec.withP2PToken ? stableP2PToken(spec.slug) : null,
        providerMetadata: {
          seedScenario: spec.scenario,
          timeZone: SEED_TIME_ZONE,
          gst: gstBreakdown(spec.amountDue),
          lineItems: lineItems(spec.lines),
          paymentTerms: "Net 14 days from invoice date",
          ...(spec.metadata ?? {}),
        },
      },
    })
    counters.invoices++

    created.set(spec.slug, {
      id: invoice.id,
      slug: spec.slug,
      clientEmail: spec.clientEmail,
      clientName: spec.clientName,
      amountDue: spec.amountDue,
    })

    // Reminder history, consistent with currentStage: the most recent reminder
    // is closest to the reference day, earlier stages roughly a week apart.
    let firstChasedAt: Date | null = null
    for (let stage = 1; stage <= remindersSent; stage++) {
      const typedStage = stage as 1 | 2 | 3
      const daysBack = Math.max(1, -spec.dueInDays + (remindersSent - stage) * 7)
      const isLast = stage === remindersSent
      const sentAt = clock.daysAgo(daysBack)
      if (stage === 1) firstChasedAt = sentAt
      await prismaAdmin.emailLog.create({
        data: {
          trackedInvoiceId: invoice.id,
          stage: typedStage,
          sentAt,
          // A null message id means no provider confirmation was recorded.
          resendMessageId:
            isLast && spec.lastReminderUndelivered ? null : `demo-seed-msg-${spec.slug}-${stage}`,
          fromAddress,
          subject: STAGE_SUBJECTS[typedStage](businessName),
        },
      })
      counters.emailLogs++
    }

    // `firstChasedAt` mirrors the real backfill (earliest EmailLog.sentAt) so
    // seeded chase-volume-allowance usage matches the reminder history above —
    // see openspec/changes/monthly-chase-volume-limits.
    if (firstChasedAt) {
      await prismaAdmin.trackedInvoice.update({
        where: { id: invoice.id },
        data: { firstChasedAt },
      })
    }
  }

  return created
}

// ---------------------------------------------------------------------------
// Account seeding
// ---------------------------------------------------------------------------

async function seedCoastline(
  user: ProvisionedAuthUser,
  clock: SeedClock,
  counters: SeedCounters,
): Promise<void> {
  const userId = user.userId
  const account = ACCOUNTS.owner
  const fromAddress = `${account.businessName} <accounts@coastline-demo.test>`
  console.log(`\nSeeding ${account.businessName} (${account.tier})…`)

  await prismaAdmin.userProfile.create({
    data: {
      userId,
      subscriptionTier: account.tier,
      subscriptionStatus: "active",
      displayName: account.displayName,
      onboardingCompletedAt: clock.daysAgo(180),
    },
  })

  await prismaAdmin.schedule.create({
    data: { userId, email1DaysAfterDue: 3, email2DaysAfterDue: 10, email3DaysAfterDue: 21 },
  })

  await prismaAdmin.emailSettings.create({
    data: {
      userId,
      fromEmail: "accounts@coastline-demo.test",
      fromName: account.businessName,
      replyTo: "accounts@coastline-demo.test",
      // Verified so the Business-tier custom-sender path is exercised. Delivery
      // is still blocked by the reserved-domain guard.
      resendVerified: true,
    },
  })

  await prismaAdmin.promiseEscalationPolicy.create({
    data: {
      userId,
      retryLimit: 2,
      escalationThreshold: 2,
      timingEscalationEnabled: true,
      toneEscalationEnabled: true,
    },
  })

  await prismaAdmin.emailTemplate.create({
    data: {
      userId,
      stage: 1,
      subject: "{{clientName}} — invoice for {{amountDue}} is now due",
      htmlBody:
        "<p>Hi {{clientName}},</p><p>Our records show an invoice for <strong>{{amountDue}}</strong> fell due on {{dueDate}}. " +
        "If it has already been paid, please disregard this note.</p><p>Thanks,<br>{{yourName}}<br>Coastline Plumbing &amp; Gas</p>",
      textBody:
        "Hi {{clientName}},\n\nOur records show an invoice for {{amountDue}} fell due on {{dueDate}}. " +
        "If it has already been paid, please disregard this note.\n\nThanks,\n{{yourName}}\nCoastline Plumbing & Gas",
    },
  })

  const stripeConn = await prismaAdmin.invoiceConnection.create({
    data: {
      userId,
      provider: "stripe",
      stripeConnectAccountId: "acct_demo_seed_coastline",
      isActive: true,
    },
  })

  const myobInvoiceConn = await prismaAdmin.invoiceConnection.create({
    data: { userId, provider: "myob", isActive: true },
  })

  const invoices = await createInvoices(
    userId,
    account.businessName,
    fromAddress,
    COASTLINE_INVOICES,
    { stripe: stripeConn.id, myob: myobInvoiceConn.id },
    clock,
    counters,
  )

  // --- Promises to pay ------------------------------------------------------
  const ringwood = invoices.get("ringwood-auto")!
  await prismaAdmin.promiseToPay.create({
    data: {
      trackedInvoiceId: ringwood.id,
      userId,
      promisedPayBy: clock.daysFromNow(6),
      promisedAmount: ringwood.amountDue,
      clientNotes: "Funds clear after our end-of-month debtor run — will pay in full.",
      status: "active",
      createdAt: clock.daysAgo(3),
    },
  })
  counters.promises++

  const sunbury = invoices.get("sunbury-landscaping")!
  // Earlier promise the client renegotiated, then the commitment they broke.
  await prismaAdmin.promiseToPay.create({
    data: {
      trackedInvoiceId: sunbury.id,
      userId,
      promisedPayBy: clock.daysAgo(20),
      promisedAmount: Math.round(sunbury.amountDue / 2),
      clientNotes: "Can we do half now, half in a fortnight?",
      status: "superseded",
      createdAt: clock.daysAgo(27),
    },
  })
  counters.promises++

  await prismaAdmin.promiseToPay.create({
    data: {
      trackedInvoiceId: sunbury.id,
      userId,
      promisedPayBy: clock.daysAgo(5),
      promisedAmount: sunbury.amountDue,
      clientNotes: "Will pay once the council progress payment lands.",
      status: "broken",
      breachNotifiedAt: clock.daysAgo(4),
      createdAt: clock.daysAgo(19),
    },
  })
  counters.promises++

  const essendon = invoices.get("essendon-signage")!
  await prismaAdmin.promiseToPay.create({
    data: {
      trackedInvoiceId: essendon.id,
      userId,
      promisedPayBy: clock.daysAgo(8),
      promisedAmount: essendon.amountDue,
      clientNotes: "Paying Friday.",
      status: "kept",
      createdAt: clock.daysAgo(17),
    },
  })
  counters.promises++

  // --- Arrangements ---------------------------------------------------------
  const dandenong = invoices.get("dandenong-freight")!
  const instalment = await prismaAdmin.arrangement.create({
    data: {
      userId,
      debtorEmail: dandenong.clientEmail,
      debtorName: dandenong.clientName,
      arrangementType: "instalment_plan",
      status: "active",
      currency: CURRENCY,
      agreedAmount: dandenong.amountDue,
      planSchedule: [
        { dueAt: clock.daysFromNow(14).toISOString(), amount: aud(4033) },
        { dueAt: clock.daysFromNow(44).toISOString(), amount: aud(4033) },
        { dueAt: clock.daysFromNow(74).toISOString(), amount: aud(4034) },
      ],
      termsNotes: "Three monthly instalments agreed by phone with the depot manager.",
      expiresAt: clock.daysFromNow(80),
      createdAt: clock.daysAgo(6),
    },
  })
  await prismaAdmin.arrangementInvoiceCoverage.create({
    data: {
      arrangementId: instalment.id,
      trackedInvoiceId: dandenong.id,
      userId,
    },
  })
  counters.arrangements++

  const broadmeadows = invoices.get("broadmeadows-panel")!
  const brokenArrangement = await prismaAdmin.arrangement.create({
    data: {
      userId,
      debtorEmail: broadmeadows.clientEmail,
      debtorName: broadmeadows.clientName,
      arrangementType: "full_payment",
      status: "broken",
      currency: CURRENCY,
      promisedPayBy: clock.daysAgo(7),
      termsNotes: "Agreed to clear the balance in full after their insurance payout.",
      breachedAt: clock.daysAgo(6),
      createdAt: clock.daysAgo(30),
    },
  })
  await prismaAdmin.arrangementInvoiceCoverage.create({
    data: {
      arrangementId: brokenArrangement.id,
      trackedInvoiceId: broadmeadows.id,
      userId,
    },
  })
  counters.arrangements++

  // Partial-payment arrangement over the multi-invoice debtor.
  const yarraville2 = invoices.get("yarraville-02")!
  const partial = await prismaAdmin.arrangement.create({
    data: {
      userId,
      debtorEmail: yarraville2.clientEmail,
      debtorName: yarraville2.clientName,
      arrangementType: "partial_payment",
      status: "active",
      currency: CURRENCY,
      agreedAmount: aud(4000),
      promisedPayBy: clock.daysFromNow(10),
      termsNotes: "$4,000 against the Stage 2 claim; balance on Stage 3 sign-off.",
      expiresAt: clock.daysFromNow(30),
      createdAt: clock.daysAgo(4),
    },
  })
  await prismaAdmin.arrangementInvoiceCoverage.create({
    data: {
      arrangementId: partial.id,
      trackedInvoiceId: yarraville2.id,
      userId,
    },
  })
  counters.arrangements++

  // A fulfilled arrangement, for arrangement-history testing.
  const camberwell = invoices.get("camberwell-strata")!
  const fulfilled = await prismaAdmin.arrangement.create({
    data: {
      userId,
      debtorEmail: camberwell.clientEmail,
      debtorName: camberwell.clientName,
      arrangementType: "full_payment",
      status: "fulfilled",
      currency: CURRENCY,
      promisedPayBy: clock.daysAgo(15),
      fulfilledAt: clock.daysAgo(15),
      termsNotes: "Committed to pay on the strata committee's next disbursement run.",
      createdAt: clock.daysAgo(25),
    },
  })
  await prismaAdmin.arrangementInvoiceCoverage.create({
    data: {
      arrangementId: fulfilled.id,
      trackedInvoiceId: camberwell.id,
      userId,
    },
  })
  counters.arrangements++

  // --- Accounting integration (demo only — sync is blocked) -----------------
  const myobConnection = await prismaAdmin.accountingConnection.create({
    data: {
      userId,
      provider: "myob",
      organisationId: `${DEMO_ORGANISATION_ID_PREFIX}myob/coastline-plumbing`,
      organisationName: "Coastline Plumbing & Gas Pty Ltd (MYOB Business — demo)",
      // Inert placeholders: not valid AES-GCM ciphertext, so they cannot decrypt
      // to anything usable even if the demo guard were bypassed.
      encryptedAccessToken: demoToken("myob-access", "coastline"),
      encryptedRefreshToken: demoToken("myob-refresh", "coastline"),
      tokenExpiresAt: clock.daysFromNow(1),
      scopes: "sme-sales sme-contacts-customer sme-company-file",
      status: "active",
      lastSyncedAt: clock.hoursAgo(9),
      createdAt: clock.daysAgo(64),
    },
  })

  await prismaAdmin.accountingSyncRun.create({
    data: {
      accountingConnectionId: myobConnection.id,
      provider: "myob",
      userId,
      startedAt: clock.hoursAgo(9),
      completedAt: clock.hoursAgo(9),
      status: "success",
      invoicesCreated: 3,
      invoicesUpdated: 11,
      invoicesSkipped: 2,
    },
  })
  counters.syncRuns++

  await seedSpendLeakFoundation(userId, myobConnection.id, "coastline", clock, counters)
  await seedMarginGuardFoundation(userId, "coastline", clock, counters)
  await seedCashPlanFoundation(userId, "coastline", clock, counters)
  await seedRunwayGuardFoundation(userId, "coastline", clock, counters)
  await seedCostGuardFoundation(userId, "coastline", clock, counters)
  await seedTaxBufferFoundation(userId, "coastline", clock, counters)
  await seedCommitGuardFoundation(userId, "coastline", clock, counters)
  await seedOwnersDigestFoundation(userId, "coastline", clock, counters)

  await prismaAdmin.accountingSyncRun.create({
    data: {
      accountingConnectionId: myobConnection.id,
      provider: "myob",
      userId,
      startedAt: clock.daysAgo(2),
      completedAt: clock.daysAgo(2),
      status: "failed",
      invoicesCreated: 0,
      invoicesUpdated: 0,
      invoicesSkipped: 0,
      errorMessage:
        "MYOB API returned 429 Too Many Requests while fetching page 3 of Sale/Invoice — sync aborted and will retry on the next scheduled run.",
    },
  })
  counters.syncRuns++

  await prismaAdmin.accountingSyncRun.create({
    data: {
      accountingConnectionId: myobConnection.id,
      provider: "myob",
      userId,
      startedAt: clock.daysAgo(5),
      completedAt: clock.daysAgo(5),
      status: "partial",
      invoicesCreated: 1,
      invoicesUpdated: 4,
      invoicesSkipped: 3,
      errorMessage: "3 invoices skipped: customer record has no email address on file.",
    },
  })
  counters.syncRuns++

  for (const slug of ["dandenong-freight", "broadmeadows-panel", "bendigo-childcare"]) {
    const invoice = invoices.get(slug)!
    const existingContact = await findOrCreateCustomer(
      prismaAdmin,
      userId,
      invoice.clientEmail,
      invoice.clientName,
      "myob",
      `demo-seed-myob-invoice-${slug}`,
    )
    await prismaAdmin.financialContact.update({
      where: { id: existingContact.financialContactId },
      data: { accountingConnectionId: myobConnection.id },
    })
    await upsertFinancialInvoice(prismaAdmin, {
      userId,
      sourceSystem: "myob",
      sourceId: `demo-seed-myob-invoice-${slug}`,
      accountingConnectionId: myobConnection.id,
      contactId: existingContact.financialContactId,
      amountDueCents: invoice.amountDue,
      currency: CURRENCY,
      dueDate: clock.daysFromNow(0),
      rawSourceData: { source: "seed", providerStatus: "Open" },
    })
    counters.mappings += 1
  }

  // --- AI usage (Business tier ai_rewrite feature) --------------------------
  await prismaAdmin.aiUsageLog.createMany({
    data: [
      {
        userId,
        model: "gpt-4o-mini",
        feature: "ai_rewrite",
        promptTokens: 412,
        completionTokens: 188,
        totalTokens: 600,
        estimatedCostUsd: "0.00013200",
        createdAt: clock.daysAgo(3),
      },
      {
        userId,
        model: "gpt-4o-mini",
        feature: "ai_rewrite",
        promptTokens: 380,
        completionTokens: 205,
        totalTokens: 585,
        estimatedCostUsd: "0.00012870",
        createdAt: clock.daysAgo(11),
      },
    ],
  })

  console.log(
    `  ✓ ${COASTLINE_INVOICES.length} invoices, 4 promises, 4 arrangements, MYOB connection, SpendLeak/MarginGuard/CashPlan/RunwayGuard/CostGuard/TaxBuffer/CommitGuard/OwnersDigest fixtures`,
  )
}

async function seedBookkeeper(
  user: ProvisionedAuthUser,
  clock: SeedClock,
  counters: SeedCounters,
): Promise<void> {
  const userId = user.userId
  const account = ACCOUNTS.bookkeeper
  console.log(`\nSeeding ${account.businessName} (${account.tier})…`)

  await prismaAdmin.userProfile.create({
    data: {
      userId,
      subscriptionTier: account.tier,
      subscriptionStatus: "active",
      displayName: account.displayName,
      onboardingCompletedAt: clock.daysAgo(45),
      // Deterministic allowance period (independent of the real-world
      // calendar month) so the at-capacity / held-invoice scenario below is
      // reproducible regardless of what day the seed is run on — see
      // openspec/changes/monthly-chase-volume-limits.
      subscriptionCurrentPeriodStart: clock.startOfDay(-20),
      subscriptionCurrentPeriodEnd: clock.startOfDay(10),
    },
  })

  await prismaAdmin.schedule.create({
    data: { userId, email1DaysAfterDue: 5, email2DaysAfterDue: 14, email3DaysAfterDue: 30 },
  })

  // No EmailSettings, EmailTemplate or AccountingConnection: Starter tier has
  // neither `custom_sender_name`/`verified_from_domain` nor
  // `custom_reminder_templates`, so the UI should gate those. Starter DOES
  // have `accounting_integrations` (core follow-up promise on every tier),
  // so the absence of an AccountingConnection here reflects the bookkeeper
  // simply not having connected one, not a plan restriction.

  const stripeConn = await prismaAdmin.invoiceConnection.create({
    data: {
      userId,
      provider: "stripe",
      stripeConnectAccountId: "acct_demo_seed_bookkeeper",
      isActive: true,
    },
  })

  await createInvoices(
    userId,
    account.businessName,
    "PaidSoon <reminders@coastline-demo.test>",
    BOOKKEEPER_INVOICES,
    { stripe: stripeConn.id },
    clock,
    counters,
  )

  console.log(`  ✓ ${BOOKKEEPER_INVOICES.length} invoices, Starter-tier entitlements`)
}

async function seedYarraValley(
  user: ProvisionedAuthUser,
  clock: SeedClock,
  counters: SeedCounters,
): Promise<void> {
  const userId = user.userId
  const account = ACCOUNTS.secondOrg
  console.log(`\nSeeding ${account.businessName} (${account.tier}, isolation tenant)…`)

  await prismaAdmin.userProfile.create({
    data: {
      userId,
      subscriptionTier: account.tier,
      subscriptionStatus: "active",
      displayName: account.displayName,
      onboardingCompletedAt: clock.daysAgo(90),
    },
  })

  await prismaAdmin.schedule.create({
    data: { userId, email1DaysAfterDue: 2, email2DaysAfterDue: 9, email3DaysAfterDue: 18 },
  })

  const stripeConn = await prismaAdmin.invoiceConnection.create({
    data: {
      userId,
      provider: "stripe",
      stripeConnectAccountId: "acct_demo_seed_yarravalley",
      isActive: true,
    },
  })

  const xeroInvoiceConn = await prismaAdmin.invoiceConnection.create({
    data: { userId, provider: "xero", isActive: true },
  })

  const invoices = await createInvoices(
    userId,
    account.businessName,
    "PaidSoon <reminders@yarravalley-demo.test>",
    YARRA_VALLEY_INVOICES,
    { stripe: stripeConn.id, xero: xeroInvoiceConn.id },
    clock,
    counters,
  )

  const warburton = invoices.get("yv-warburton")!
  await prismaAdmin.promiseToPay.create({
    data: {
      trackedInvoiceId: warburton.id,
      userId,
      promisedPayBy: clock.daysFromNow(5),
      promisedAmount: warburton.amountDue,
      clientNotes: "Paying after the long weekend bookings settle.",
      status: "active",
      createdAt: clock.daysAgo(2),
    },
  })
  counters.promises++

  // Xero connection left in an error state — exercises the "reconnect required"
  // banner. It is also demo-guarded, so no sync is ever attempted.
  const xeroConnection = await prismaAdmin.accountingConnection.create({
    data: {
      userId,
      provider: "xero",
      organisationId: `${DEMO_ORGANISATION_ID_PREFIX}xero/yarra-valley-web-studio`,
      organisationName: "Yarra Valley Web Studio (Xero — demo)",
      encryptedAccessToken: demoToken("xero-access", "yarravalley"),
      encryptedRefreshToken: demoToken("xero-refresh", "yarravalley"),
      tokenExpiresAt: clock.daysAgo(3),
      scopes: "offline_access accounting.transactions.read accounting.contacts.read",
      status: "error",
      lastSyncedAt: clock.daysAgo(3),
      createdAt: clock.daysAgo(120),
    },
  })

  await prismaAdmin.accountingSyncRun.create({
    data: {
      accountingConnectionId: xeroConnection.id,
      provider: "xero",
      userId,
      startedAt: clock.daysAgo(10),
      completedAt: clock.daysAgo(10),
      status: "success",
      invoicesCreated: 3,
      invoicesUpdated: 1,
      invoicesSkipped: 0,
    },
  })
  counters.syncRuns++

  await seedSpendLeakFoundation(userId, xeroConnection.id, "yarra", clock, counters)
  await seedMarginGuardFoundation(userId, "yarra", clock, counters)
  await seedCashPlanFoundation(userId, "yarra", clock, counters)
  await seedRunwayGuardFoundation(userId, "yarra", clock, counters)
  await seedCostGuardFoundation(userId, "yarra", clock, counters)
  await seedTaxBufferFoundation(userId, "yarra", clock, counters)
  await seedCommitGuardFoundation(userId, "yarra", clock, counters)
  await seedOwnersDigestFoundation(userId, "yarra", clock, counters)

  await prismaAdmin.accountingSyncRun.create({
    data: {
      accountingConnectionId: xeroConnection.id,
      provider: "xero",
      userId,
      startedAt: clock.daysAgo(3),
      completedAt: clock.daysAgo(3),
      status: "failed",
      invoicesCreated: 0,
      invoicesUpdated: 0,
      invoicesSkipped: 0,
      errorMessage:
        "Xero refresh token was rejected (invalid_grant). The account owner needs to reconnect Xero from Settings → Connections.",
    },
  })
  counters.syncRuns++

  for (const slug of ["yv-healesville", "yv-warburton", "yv-lilydale"]) {
    const invoice = invoices.get(slug)!
    const existingContact = await findOrCreateCustomer(
      prismaAdmin,
      userId,
      invoice.clientEmail,
      invoice.clientName,
      "xero",
      `demo-seed-xero-invoice-${slug}`,
    )
    await prismaAdmin.financialContact.update({
      where: { id: existingContact.financialContactId },
      data: { accountingConnectionId: xeroConnection.id },
    })
    await upsertFinancialInvoice(prismaAdmin, {
      userId,
      sourceSystem: "xero",
      sourceId: `demo-seed-xero-invoice-${slug}`,
      accountingConnectionId: xeroConnection.id,
      contactId: existingContact.financialContactId,
      amountDueCents: invoice.amountDue,
      currency: CURRENCY,
      dueDate: clock.daysFromNow(0),
      rawSourceData: { source: "seed", providerStatus: "AUTHORISED" },
    })
    counters.mappings += 1
  }

  console.log(
    `  ✓ ${YARRA_VALLEY_INVOICES.length} invoices, 1 promise, Xero connection, SpendLeak/MarginGuard/CashPlan/RunwayGuard/CostGuard/TaxBuffer/CommitGuard/OwnersDigest fixtures`,
  )
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  checkEnvironment()

  const reference = resolveSeedReferenceDate(process.env.SEED_REFERENCE_DATE)
  const clock = createSeedClock(reference)

  console.log("\n=== PaidSoon Development Seed ===")
  console.log(`Run at:         ${new Date().toISOString()}`)
  console.log(`Reference date: ${reference.toISOString()} (midday ${SEED_TIME_ZONE})`)
  console.log(
    `Source:         ${process.env.SEED_REFERENCE_DATE ? "SEED_REFERENCE_DATE" : "current Melbourne date"}`,
  )
  if (process.env.SEED_RESET_ONLY === "true") {
    console.log("Mode:           RESET ONLY (seed-owned records are deleted, nothing recreated)")
  }

  console.log("\nProvisioning Supabase Auth users…")
  const provisioned = await provisionSeedAuthUsers({
    accounts: Object.values(ACCOUNTS).map((a) => ({
      key: a.key,
      email: a.email,
      displayName: a.displayName,
    })),
    skipAuth: process.env.SEED_SKIP_AUTH === "true",
  })

  const byKey = new Map<AccountKey, ProvisionedAuthUser>(
    provisioned.map((p) => [p.key as AccountKey, p]),
  )
  for (const user of provisioned) {
    console.log(`  ✓ ${user.email} → ${user.userId} (${user.source})`)
  }

  const seedUserIds = provisioned.map((p) => p.userId)
  await cleanup([...new Set([...seedUserIds, ...LEGACY_SEED_USER_IDS])])

  if (process.env.SEED_RESET_ONLY === "true") {
    console.log("\n=== Reset complete ===")
    console.log("Only records owned by the seed accounts were removed.")
    console.log("The Supabase Auth users themselves were left in place.")
    return
  }

  const counters: SeedCounters = {
    invoices: 0,
    emailLogs: 0,
    promises: 0,
    arrangements: 0,
    syncRuns: 0,
    mappings: 0,
    spendBills: 0,
    spendTransactions: 0,
    spendSuppliers: 0,
    spendInsights: 0,
    cashSnapshots: 0,
    marginSnapshots: 0,
    marginAlerts: 0,
    marginOpportunities: 0,
    cashPlans: 0,
    cashPlanAlerts: 0,
    runwaySnapshots: 0,
    runwayAlerts: 0,
    costGuardForecasts: 0,
    costGuardAlerts: 0,
    taxCategories: 0,
    taxObligations: 0,
    taxEvents: 0,
    taxSnapshots: 0,
    commitments: 0,
    commitmentCandidates: 0,
    ownersDigestSnapshots: 0,
    ownersDigestItems: 0,
  }

  await seedCoastline(byKey.get("owner")!, clock, counters)
  await seedBookkeeper(byKey.get("bookkeeper")!, clock, counters)
  await seedYarraValley(byKey.get("secondOrg")!, clock, counters)

  const usingSyntheticIds = provisioned.some((p) => p.source === "synthetic")

  console.log("\n=== Seed complete ===")
  console.log(`  Accounts:             ${provisioned.length}`)
  console.log(`  Tracked invoices:     ${counters.invoices}`)
  console.log(`  Reminder email logs:  ${counters.emailLogs}`)
  console.log(`  Promises to pay:      ${counters.promises}`)
  console.log(`  Arrangements:         ${counters.arrangements}`)
  console.log(`  Accounting sync runs: ${counters.syncRuns}`)
  console.log(`  Provider mappings:    ${counters.mappings}`)
  console.log(`  SpendLeak bills:      ${counters.spendBills}`)
  console.log(`  SpendLeak txns:       ${counters.spendTransactions}`)
  console.log(`  SpendLeak suppliers:  ${counters.spendSuppliers}`)
  console.log(`  SpendLeak findings:   ${counters.spendInsights}`)
  console.log(`  Cash snapshots:       ${counters.cashSnapshots}`)
  console.log(`  Margin snapshots:     ${counters.marginSnapshots}`)
  console.log(`  Margin alerts:        ${counters.marginAlerts}`)
  console.log(`  Margin opportunities: ${counters.marginOpportunities}`)
  console.log(`  Cash plans:           ${counters.cashPlans}`)
  console.log(`  Cash plan alerts:     ${counters.cashPlanAlerts}`)
  console.log(`  Runway snapshots:     ${counters.runwaySnapshots}`)
  console.log(`  Runway alerts:        ${counters.runwayAlerts}`)
  console.log(`  Cost guard forecasts: ${counters.costGuardForecasts}`)
  console.log(`  Cost guard alerts:    ${counters.costGuardAlerts}`)
  console.log(`  Tax categories:       ${counters.taxCategories}`)
  console.log(`  Tax obligations:      ${counters.taxObligations}`)
  console.log(`  Tax events:           ${counters.taxEvents}`)
  console.log(`  Tax snapshots:        ${counters.taxSnapshots}`)
  console.log(`  Commitments:          ${counters.commitments}`)
  console.log(`  Commitment candidates:${counters.commitmentCandidates}`)
  console.log(`  Owners digest snaps:  ${counters.ownersDigestSnapshots}`)
  console.log(`  Owners digest items:  ${counters.ownersDigestItems}`)

  console.log("\nDevelopment sign-in (development environments only):")
  for (const account of Object.values(ACCOUNTS)) {
    console.log(`  ${account.email.padEnd(34)} ${account.businessName} (${account.tier})`)
  }
  console.log(
    `  Password: ${process.env.SEED_USER_PASSWORD ? "(from SEED_USER_PASSWORD)" : DEFAULT_SEED_PASSWORD}`,
  )

  if (usingSyntheticIds) {
    console.log("\nNOTE: synthetic user ids were used (no Supabase admin credentials).")
    console.log("      These accounts cannot be signed into until relinked to real auth users.")
  }

  console.log("\nOutbound activity is disabled for this data:")
  console.log("  - All addresses use reserved .test domains (delivery guard blocks sending).")
  console.log("  - Accounting connections use demo-seed: organisation ids (sync is skipped).")
  console.log("\nRun `npm run verify-seed` to validate the seeded data set.")
}

/**
 * Prisma's connection errors surface as a long stack trace pointing at whichever
 * query happened to run first, which reads like a bug in the seed. Translate the
 * two common ones into an actionable message.
 */
function explainConnectionError(err: unknown): string | null {
  const code = (err as { code?: string } | null)?.code
  const host = (() => {
    try {
      const url = new URL(process.env.DATABASE_URL ?? "")
      return `${url.hostname}:${url.port || "5432"}`
    } catch {
      return "<unparseable DATABASE_URL>"
    }
  })()

  if (code === "P1000") {
    return [
      "The database rejected the credentials in DATABASE_URL.",
      "",
      `  Host: ${host}`,
      "",
      "This is a credentials problem, not a seed problem — the password is stale or",
      "was rotated. Reset it in the Supabase dashboard (Project Settings → Database →",
      "Reset database password), then update DATABASE_URL, DIRECT_URL and",
      "SUPABASE_DB_PASSWORD in .env.local. Note that a password containing @ : / ? # or",
      "% must be percent-encoded inside the connection URL.",
    ].join("\n")
  }

  if (code === "P1001") {
    return [
      "Could not reach the database server.",
      "",
      `  Host: ${host}`,
      "",
      "Check that DATABASE_URL points at the Supabase pooler host (…pooler.supabase.com)",
      "rather than the direct db.<ref>.supabase.co host, which is IPv6-only.",
    ].join("\n")
  }

  return null
}

main()
  .catch((err) => {
    const explanation = explainConnectionError(err)
    if (explanation) {
      console.error(`\nSeed failed: ${explanation}`)
    } else {
      console.error("\nSeed failed:", err)
    }
    process.exit(1)
  })
  .finally(() => prismaAdmin.$disconnect())
