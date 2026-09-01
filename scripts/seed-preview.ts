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
import { DEMO_ORGANISATION_ID_PREFIX } from "../lib/providers/accounting/demoGuard"
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
    tier: "starter",
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
}

/** Deterministic, obviously-fake token (never a real credential). */
function demoToken(kind: string, slug: string): string {
  return `demo-seed-${kind}-${slug}-not-a-real-token`
}

function stableP2PToken(slug: string): string {
  return `demoseedp2p${slug.replace(/[^a-z0-9]/g, "")}`.padEnd(48, "0").slice(0, 64)
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
    `  ✓ ${COASTLINE_INVOICES.length} invoices, 4 promises, 4 arrangements, MYOB connection (demo, sync blocked)`,
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

  console.log(`  ✓ ${YARRA_VALLEY_INVOICES.length} invoices, 1 promise, Xero connection (error state)`)
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
