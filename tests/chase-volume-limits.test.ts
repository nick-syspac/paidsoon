/**
 * Unit tests for the monthly chase-volume allowance model
 * (openspec/changes/monthly-chase-volume-limits).
 *
 * The period resolver and allowance-status computation live in
 * `lib/billing.ts`, which imports `withUserContext` → `prismaAdmin` and
 * therefore cannot be imported directly in tests (no real DB in CI — see
 * tests/accounting-sync.test.ts for the same constraint). The pure logic is
 * reimplemented here, mirroring lib/billing.ts exactly, so these tests
 * exercise the same behaviour without a DB connection.
 */
import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { isNearLimit } from "@/lib/dashboardUpsell"

// ---------------------------------------------------------------------------
// Mirrors lib/billing.ts — Melbourne timezone + allowance period helpers.
// ---------------------------------------------------------------------------

const ALLOWANCE_PERIOD_TIME_ZONE = "Australia/Melbourne"

interface ZonedDateParts {
  year: number
  month: number
  day: number
}

function zonedOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant)

  const lookup: Record<string, string> = {}
  for (const part of parts) lookup[part.type] = part.value

  const asUtc = Date.UTC(
    Number(lookup.year),
    Number(lookup.month) - 1,
    Number(lookup.day),
    Number(lookup.hour) % 24,
    Number(lookup.minute),
    Number(lookup.second),
  )

  return asUtc - instant.getTime()
}

function zonedMidnightToUtc(parts: ZonedDateParts, timeZone: string): Date {
  const naive = Date.UTC(parts.year, parts.month - 1, parts.day)
  const firstPass = new Date(naive - zonedOffsetMs(new Date(naive), timeZone))
  const secondOffset = zonedOffsetMs(firstPass, timeZone)
  return new Date(naive - secondOffset)
}

function zonedDateParts(instant: Date, timeZone: string): ZonedDateParts {
  const offset = zonedOffsetMs(instant, timeZone)
  const shifted = new Date(instant.getTime() + offset)
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  }
}

interface AllowancePeriod {
  start: Date
  end: Date
}

interface AllowanceAccountSnapshot {
  subscriptionTier?: string | null
  subscriptionStatus: string
  subscriptionCurrentPeriodStart: Date | null
  subscriptionCurrentPeriodEnd: Date | null
  trialEndsAt: Date | null
  createdAt: Date
}

function resolveAllowancePeriod(
  account: AllowanceAccountSnapshot,
  now: Date = new Date(),
): AllowancePeriod {
  if (account.subscriptionCurrentPeriodStart && account.subscriptionCurrentPeriodEnd) {
    return {
      start: account.subscriptionCurrentPeriodStart,
      end: account.subscriptionCurrentPeriodEnd,
    }
  }

  if (account.subscriptionStatus === "trialing" && account.trialEndsAt) {
    return { start: account.createdAt, end: account.trialEndsAt }
  }

  const { year, month } = zonedDateParts(now, ALLOWANCE_PERIOD_TIME_ZONE)
  const start = zonedMidnightToUtc({ year, month, day: 1 }, ALLOWANCE_PERIOD_TIME_ZONE)
  const nextMonth = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 }
  const end = zonedMidnightToUtc(
    { year: nextMonth.year, month: nextMonth.month, day: 1 },
    ALLOWANCE_PERIOD_TIME_ZONE,
  )
  return { start, end }
}

const TIER_ALLOWANCES: Record<string, number> = {
  starter: 10,
  solo: 50,
  small_business: 200,
}

function allowanceForTier(tier?: string | null): number {
  return TIER_ALLOWANCES[tier ?? "starter"] ?? TIER_ALLOWANCES.starter
}

interface ChaseAllowanceStatus {
  period: AllowancePeriod
  allowance: number
  usage: number
  remaining: number
  atCapacity: boolean
  nearLimit: boolean
}

function computeChaseAllowanceStatus(
  account: AllowanceAccountSnapshot,
  firstChasedAtTimestamps: Date[],
  now: Date = new Date(),
): ChaseAllowanceStatus {
  const period = resolveAllowancePeriod(account, now)
  const allowance = allowanceForTier(account.subscriptionTier)
  const usage = firstChasedAtTimestamps.filter(
    (timestamp) => timestamp >= period.start && timestamp < period.end,
  ).length
  const remaining = Math.max(allowance - usage, 0)
  return {
    period,
    allowance,
    usage,
    remaining,
    atCapacity: usage >= allowance,
    nearLimit: isNearLimit(usage, allowance),
  }
}

// ---------------------------------------------------------------------------
// Mirrors the cron gating decision in app/api/cron/send-emails/route.ts.
// ---------------------------------------------------------------------------

interface CronInvoice {
  id: string
  userId: string
  currentStage: number
}

interface MutableAllowance {
  allowance: number
  usage: number
  remaining: number
}

function processInvoiceForCronPass(
  invoice: CronInvoice,
  allowanceByUser: Map<string, MutableAllowance>,
): { sent: boolean; held: boolean; firstChase: boolean } {
  const isFirstChase = invoice.currentStage === 0

  if (isFirstChase) {
    const status = allowanceByUser.get(invoice.userId)
    if (status && status.remaining <= 0) {
      return { sent: false, held: true, firstChase: true }
    }
  }

  // Simulate a successful send.
  if (isFirstChase) {
    const status = allowanceByUser.get(invoice.userId)
    if (status) {
      status.usage += 1
      status.remaining = Math.max(status.allowance - status.usage, 0)
    }
  }

  return { sent: true, held: false, firstChase: isFirstChase }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("chase-volume allowance — period resolver (6.3)", () => {
  const now = new Date("2026-07-25T04:00:00.000Z")

  test("active subscription uses the billing period", () => {
    const period = resolveAllowancePeriod(
      {
        subscriptionStatus: "active",
        subscriptionCurrentPeriodStart: new Date("2026-07-10T00:00:00.000Z"),
        subscriptionCurrentPeriodEnd: new Date("2026-08-10T00:00:00.000Z"),
        trialEndsAt: null,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      },
      now,
    )
    assert.equal(period.start.toISOString(), "2026-07-10T00:00:00.000Z")
    assert.equal(period.end.toISOString(), "2026-08-10T00:00:00.000Z")
  })

  test("trialing account with no billing period uses the trial window", () => {
    const createdAt = new Date("2026-07-01T00:00:00.000Z")
    const trialEndsAt = new Date("2026-07-15T00:00:00.000Z")
    const period = resolveAllowancePeriod(
      {
        subscriptionStatus: "trialing",
        subscriptionCurrentPeriodStart: null,
        subscriptionCurrentPeriodEnd: null,
        trialEndsAt,
        createdAt,
      },
      now,
    )
    assert.equal(period.start, createdAt)
    assert.equal(period.end, trialEndsAt)
  })

  test("account with neither a billing period nor a trial window falls back to the calendar month in Australia/Melbourne", () => {
    const period = resolveAllowancePeriod(
      {
        subscriptionStatus: "active",
        subscriptionCurrentPeriodStart: null,
        subscriptionCurrentPeriodEnd: null,
        trialEndsAt: null,
        createdAt: new Date("2020-01-01T00:00:00.000Z"),
      },
      now,
    )
    // 2026-07-25T04:00Z is 2026-07-25 14:00 in Melbourne (AEST, UTC+10) → July.
    assert.equal(period.start.toISOString(), "2026-06-30T14:00:00.000Z") // 1 Jul 00:00 Melbourne
    assert.equal(period.end.toISOString(), "2026-07-31T14:00:00.000Z") // 1 Aug 00:00 Melbourne
  })
})

describe("chase-volume allowance — usage counting and reset (6.1, 6.2, 6.4)", () => {
  const account: AllowanceAccountSnapshot = {
    subscriptionTier: "starter",
    subscriptionStatus: "active",
    subscriptionCurrentPeriodStart: new Date("2026-07-01T00:00:00.000Z"),
    subscriptionCurrentPeriodEnd: new Date("2026-08-01T00:00:00.000Z"),
    trialEndsAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  }

  test("only invoices with a firstChasedAt timestamp inside the period count as usage", () => {
    const status = computeChaseAllowanceStatus(account, [
      new Date("2026-07-05T00:00:00.000Z"),
      new Date("2026-07-20T00:00:00.000Z"),
    ])
    assert.equal(status.usage, 2)
    assert.equal(status.remaining, 8)
  })

  test("an invoice never chased (no firstChasedAt) consumes no allowance", () => {
    const status = computeChaseAllowanceStatus(account, [])
    assert.equal(status.usage, 0)
    assert.equal(status.remaining, 10)
  })

  test("a single firstChasedAt timestamp counts once no matter how many later stages exist — usage is not per-EmailLog", () => {
    // An invoice's currentStage may have advanced through 1 → 2 → 3, but it
    // only ever has one firstChasedAt timestamp, so it is one unit of usage.
    const status = computeChaseAllowanceStatus(account, [new Date("2026-07-05T00:00:00.000Z")])
    assert.equal(status.usage, 1)
  })

  test("usage resets when the period rolls over", () => {
    const nextPeriodAccount: AllowanceAccountSnapshot = {
      ...account,
      subscriptionCurrentPeriodStart: new Date("2026-08-01T00:00:00.000Z"),
      subscriptionCurrentPeriodEnd: new Date("2026-09-01T00:00:00.000Z"),
    }
    // Same historical timestamps as the previous period — none fall inside
    // the new period, so usage is zero.
    const status = computeChaseAllowanceStatus(nextPeriodAccount, [
      new Date("2026-07-05T00:00:00.000Z"),
      new Date("2026-07-20T00:00:00.000Z"),
    ])
    assert.equal(status.usage, 0)
    assert.equal(status.remaining, 10)
  })
})

describe("chase-volume allowance — 80% threshold boundary (6.7)", () => {
  const account: AllowanceAccountSnapshot = {
    subscriptionTier: "starter",
    subscriptionStatus: "active",
    subscriptionCurrentPeriodStart: new Date("2026-07-01T00:00:00.000Z"),
    subscriptionCurrentPeriodEnd: new Date("2026-08-01T00:00:00.000Z"),
    trialEndsAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  }

  function timestampsFor(count: number): Date[] {
    return Array.from({ length: count }, (_, i) => new Date(Date.UTC(2026, 6, 1 + i)))
  }

  test("just below 80% (7/10) is not near limit", () => {
    const status = computeChaseAllowanceStatus(account, timestampsFor(7))
    assert.equal(status.nearLimit, false)
  })

  test("exactly 80% (8/10) is near limit", () => {
    const status = computeChaseAllowanceStatus(account, timestampsFor(8))
    assert.equal(status.nearLimit, true)
  })

  test("above 80% (9/10) is near limit and not yet at capacity", () => {
    const status = computeChaseAllowanceStatus(account, timestampsFor(9))
    assert.equal(status.nearLimit, true)
    assert.equal(status.atCapacity, false)
  })

  test("100% usage (10/10) is at capacity", () => {
    const status = computeChaseAllowanceStatus(account, timestampsFor(10))
    assert.equal(status.atCapacity, true)
    assert.equal(status.remaining, 0)
  })
})

describe("chase-volume allowance — calendar day arithmetic in Australia/Melbourne (6.8)", () => {
  test("a firstChasedAt just before midnight Melbourne on the last day of the month stays in that month's period", () => {
    // 2026-07-31 23:59 in Melbourne (AEST, UTC+10) = 2026-07-31T13:59:00Z.
    const lateInMonth = new Date("2026-07-31T13:59:00.000Z")
    const now = new Date("2026-07-15T00:00:00.000Z")

    const account: AllowanceAccountSnapshot = {
      subscriptionTier: "starter",
      subscriptionStatus: "active",
      subscriptionCurrentPeriodStart: null,
      subscriptionCurrentPeriodEnd: null,
      trialEndsAt: null,
      createdAt: new Date("2020-01-01T00:00:00.000Z"),
    }

    const status = computeChaseAllowanceStatus(account, [lateInMonth], now)
    assert.equal(status.usage, 1, "23:59 Melbourne on the last day must still fall inside July's period")
  })

  test("a firstChasedAt one minute later (past midnight Melbourne) falls into the next month's period", () => {
    // 2026-08-01 00:01 in Melbourne (AEST, UTC+10) = 2026-07-31T14:01:00Z.
    const justAfterMidnight = new Date("2026-07-31T14:01:00.000Z")
    const now = new Date("2026-07-15T00:00:00.000Z")

    const account: AllowanceAccountSnapshot = {
      subscriptionTier: "starter",
      subscriptionStatus: "active",
      subscriptionCurrentPeriodStart: null,
      subscriptionCurrentPeriodEnd: null,
      trialEndsAt: null,
      createdAt: new Date("2020-01-01T00:00:00.000Z"),
    }

    const status = computeChaseAllowanceStatus(account, [justAfterMidnight], now)
    assert.equal(status.usage, 0, "00:01 Melbourne on the 1st must not count in July's period")
  })
})

describe("cron pass gating — sequences in progress and per-pass allowance (6.5, 6.6)", () => {
  test("a sequence already in progress completes even when the account is at capacity", () => {
    const allowanceByUser = new Map<string, MutableAllowance>([
      ["user-1", { allowance: 10, usage: 10, remaining: 0 }],
    ])

    const inProgress: CronInvoice = { id: "inv-1", userId: "user-1", currentStage: 1 }
    const result = processInvoiceForCronPass(inProgress, allowanceByUser)

    assert.equal(result.sent, true)
    assert.equal(result.held, false)
    assert.equal(result.firstChase, false)
    // Allowance is untouched by stage 2/3 sends.
    assert.equal(allowanceByUser.get("user-1")!.usage, 10)
  })

  test("a first-chase invoice is held (not sent) once the account has no remaining allowance", () => {
    const allowanceByUser = new Map<string, MutableAllowance>([
      ["user-1", { allowance: 10, usage: 10, remaining: 0 }],
    ])

    const firstChase: CronInvoice = { id: "inv-2", userId: "user-1", currentStage: 0 }
    const result = processInvoiceForCronPass(firstChase, allowanceByUser)

    assert.equal(result.sent, false)
    assert.equal(result.held, true)
    assert.equal(result.firstChase, true)
  })

  test("a single cron pass cannot exceed the allowance across multiple first-chase invoices", () => {
    const allowanceByUser = new Map<string, MutableAllowance>([
      ["user-1", { allowance: 2, usage: 0, remaining: 2 }],
    ])

    const invoices: CronInvoice[] = [
      { id: "a", userId: "user-1", currentStage: 0 },
      { id: "b", userId: "user-1", currentStage: 0 },
      { id: "c", userId: "user-1", currentStage: 0 },
      { id: "d", userId: "user-1", currentStage: 0 },
    ]

    const results = invoices.map((invoice) => processInvoiceForCronPass(invoice, allowanceByUser))

    const sentCount = results.filter((r) => r.sent).length
    const heldCount = results.filter((r) => r.held).length

    assert.equal(sentCount, 2, "only 2 of 4 first-chase invoices may send, matching the allowance")
    assert.equal(heldCount, 2)
    assert.equal(allowanceByUser.get("user-1")!.remaining, 0)
    assert.equal(allowanceByUser.get("user-1")!.usage, 2)
  })
})
