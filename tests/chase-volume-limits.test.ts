/** Exercise the real billing helpers/loaders, with no database or providers. */
import { test, describe, mock } from "node:test"
import assert from "node:assert/strict"
import type { AllowanceAccountSnapshot } from "@/lib/billing"
import type { PrismaClient } from "@/lib/generated/prisma/client"
import type { PrismaTx } from "@/lib/db/withUserContext"
import type { TrialGrantSnapshot, BillingRiskSnapshot } from "@/lib/billing/effectiveAccess"

await mock.module("server-only", { namedExports: {} })
await mock.module("@/lib/db/admin", { namedExports: { prismaAdmin: {
  platformRole: { findUnique: async () => null, findMany: async () => [] },
} } })
await mock.module("@/lib/db/withUserContext", {
  namedExports: { withUserContext: async () => { throw new Error("Unexpected global DB context") } },
})
const {
  resolveAllowancePeriod,
  computeChaseAllowanceStatus,
  getChaseAllowanceStatus,
  getChaseAllowanceStatusForAccount,
  getChaseAllowanceStatusesForUsers,
  getInvoiceLimitForTier,
} = await import("@/lib/billing")

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
    const trialEndsAt = new Date("2026-08-01T00:00:00.000Z")
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
    subscriptionTier: "essentials",
    subscriptionStatus: "active",
    stripeSubscriptionId: "sub-test",
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
    subscriptionTier: "essentials",
    subscriptionStatus: "active",
    stripeSubscriptionId: "sub-test",
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
      subscriptionTier: "essentials",
      subscriptionStatus: "active",
      stripeSubscriptionId: "sub-test",
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
      subscriptionTier: "essentials",
      subscriptionStatus: "active",
      stripeSubscriptionId: "sub-test",
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

const evaluationTime = new Date("2026-10-14T12:00:00Z")
const grantStart = new Date("2026-09-25T12:00:00Z")
const grantEnd = new Date("2026-10-20T12:00:00Z")
const grantSelect = { plan: true, startsAt: true, expiresAt: true, revokedAt: true }
const riskSelect = { kind: true, stripeStatus: true, blocking: true }
const allowanceProfileSelect = {
  subscriptionStatus: true, subscriptionTier: true, stripeSubscriptionId: true,
  trialEndsAt: true, billingAccessVersion: true,
  subscriptionCurrentPeriodStart: true, subscriptionCurrentPeriodEnd: true,
  createdAt: true, tenantTrialGrant: { select: grantSelect },
}

function account(overrides: Partial<AllowanceAccountSnapshot> = {}): AllowanceAccountSnapshot {
  return {
    subscriptionStatus: "canceled", subscriptionTier: "essentials",
    stripeSubscriptionId: null, billingAccessVersion: 3,
    subscriptionCurrentPeriodStart: new Date("2026-01-01T00:00:00Z"),
    subscriptionCurrentPeriodEnd: new Date("2026-02-01T00:00:00Z"),
    trialEndsAt: null, createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  }
}

function grant(overrides: Partial<TrialGrantSnapshot> = {}): TrialGrantSnapshot {
  return { plan: "business_control", startsAt: grantStart, expiresAt: grantEnd, revokedAt: null, ...overrides }
}

interface ScopedQuery {
  where: { userId: string | { in: string[] }; firstChasedAt?: { gte: Date; lt?: Date } }
  select?: Record<string, unknown>
}

/** Only read delegates exist, so reset/write queries or global-client use fail. */
function fixture() {
  const profiles = new Map<string, AllowanceAccountSnapshot>([["tenant-a", account()]])
  const grants = new Map<string, TrialGrantSnapshot>([["tenant-a", grant()]])
  const risks = new Map<string, BillingRiskSnapshot[]>()
  const invoices: { userId: string; firstChasedAt: Date | null; currentStage?: number; status?: string }[] = []
  const reads: { model: string; args: ScopedQuery }[] = []
  const ids = (query: ScopedQuery) => typeof query.where.userId === "string"
    ? [query.where.userId] : query.where.userId.in
  const record = (model: string, args: ScopedQuery) => {
    reads.push({ model, args })
    return ids(args)
  }
  const rows = (args: ScopedQuery) => {
    record("trackedInvoice", args)
    assert.ok(args.where.firstChasedAt)
    return invoices.filter((row) => ids(args).includes(row.userId) && row.firstChasedAt &&
      row.firstChasedAt >= args.where.firstChasedAt!.gte &&
      (!args.where.firstChasedAt!.lt || row.firstChasedAt < args.where.firstChasedAt!.lt))
  }
  const client = {
    userProfile: {
      findUnique: async (args: ScopedQuery) => {
        assert.deepEqual(args.select, allowanceProfileSelect)
        const userId = record("userProfile", args)[0]
        const value = profiles.get(userId)
        return value ? { ...value, tenantTrialGrant: grants.get(userId) ?? null } : null
      },
      findMany: async (args: ScopedQuery) => {
        assert.deepEqual(args.select, { userId: true, ...allowanceProfileSelect })
        return record("userProfile", args).flatMap((userId) => {
          const value = profiles.get(userId)
          return value ? [{ userId, ...value, tenantTrialGrant: grants.get(userId) ?? null }] : []
        })
      },
    },
    tenantTrialGrant: {
      findUnique: async (args: ScopedQuery) => {
        assert.deepEqual(args.select, grantSelect)
        return grants.get(record("tenantTrialGrant", args)[0]) ?? null
      },
    },
    tenantBillingRisk: {
      findMany: async (args: ScopedQuery) => {
        const batch = typeof args.where.userId !== "string"
        assert.deepEqual(args.select, batch ? { userId: true, ...riskSelect } : riskSelect)
        return record("tenantBillingRisk", args).flatMap((userId) =>
          (risks.get(userId) ?? []).map((risk) => batch ? { userId, ...risk } : risk))
      },
    },
    trackedInvoice: {
      count: async (args: ScopedQuery) => rows(args).length,
      findMany: async (args: ScopedQuery) => {
        assert.deepEqual(args.select, { userId: true, firstChasedAt: true })
        return rows(args)
      },
    },
  }
  return { profiles, grants, risks, invoices, reads, client,
    tx: client as unknown as PrismaTx, prisma: client as unknown as PrismaClient }
}

describe("effective chase allowances — real single and batched loaders", () => {
  test("all public grant plans use catalog limits and the stable grant window, not inactive billing dates", async () => {
    for (const [plan, limit] of [["essentials", 10], ["business_control", 50], ["small_business", 250], ["business_pro", 1000]] as const) {
      const f = fixture()
      f.grants.set("tenant-a", grant({ plan }))
      f.invoices.push(
        { userId: "tenant-a", firstChasedAt: new Date(grantStart.getTime() - 1) },
        { userId: "tenant-a", firstChasedAt: grantStart },
        { userId: "tenant-a", firstChasedAt: evaluationTime },
        { userId: "tenant-a", firstChasedAt: grantEnd },
        { userId: "tenant-a", firstChasedAt: null },
      )
      const status = await getChaseAllowanceStatus(f.prisma, "tenant-a", evaluationTime)
      assert.deepEqual(status, {
        period: { start: grantStart, end: grantEnd }, accessAllowed: true,
        allowance: limit, usage: 2, remaining: limit - 2, atCapacity: false, nearLimit: false,
      })
      assert.deepEqual(computeChaseAllowanceStatus({ ...f.profiles.get("tenant-a")!, grant: f.grants.get("tenant-a") },
        f.invoices.flatMap((row) => row.firstChasedAt ? [row.firstChasedAt] : []), evaluationTime), status)
      assert.deepEqual(await getChaseAllowanceStatusForAccount(f.tx, "tenant-a", f.profiles.get("tenant-a")!, evaluationTime), status)
      assert.deepEqual((await getChaseAllowanceStatusesForUsers(f.tx, ["tenant-a"], evaluationTime)).get("tenant-a"), status)
      assert.equal(getInvoiceLimitForTier(plan), limit)
    }
  })

  test("extension and plan changes keep lifetime firstChasedAt consumption and the original start", async () => {
    const f = fixture()
    f.grants.set("tenant-a", grant({ plan: "essentials" }))
    f.invoices.push(...Array.from({ length: 8 }, () => ({ userId: "tenant-a", firstChasedAt: grantStart, currentStage: 3, status: "resolved" })))
    const initial = await getChaseAllowanceStatus(f.tx, "tenant-a", evaluationTime)
    assert.equal(initial?.nearLimit, true)
    f.grants.set("tenant-a", grant({ plan: "business_pro", expiresAt: new Date("2026-11-20T12:00:00Z") }))
    const extended = await getChaseAllowanceStatus(f.tx, "tenant-a", new Date("2026-11-01T00:00:00Z"))
    assert.deepEqual(extended?.period.start, initial?.period.start)
    assert.equal(extended?.usage, 8)
    assert.equal(extended?.remaining, 992)
    // Restarted, paused and resolved sequences all retain their original first
    // chase. Neither status nor stage nor subsequent EmailLogs enters accounting.
    for (const invoice of f.invoices) { invoice.currentStage = 0; invoice.status = "paused" }
    f.grants.set("tenant-a", grant({ plan: "essentials", expiresAt: new Date("2026-11-21T12:00:00Z") }))
    const changed = await getChaseAllowanceStatus(f.tx, "tenant-a", new Date("2026-11-01T00:00:00Z"))
    assert.equal(changed?.usage, 8)
    assert.equal(changed?.remaining, 2)
    assert.deepEqual(f.invoices.map((row) => row.firstChasedAt), Array(8).fill(grantStart))
    for (const read of f.reads.filter((read) => read.model === "trackedInvoice")) {
      assert.deepEqual(Object.keys(read.args.where).sort(), ["firstChasedAt", "userId"])
    }
  })

  test("lapse/revocation do not synthesize a fresh window; only a supplied new grant start does", async () => {
    for (const revoked of [false, true]) {
      const f = fixture()
      f.invoices.push({ userId: "tenant-a", firstChasedAt: grantStart, currentStage: 0 })
      if (revoked) f.grants.set("tenant-a", grant({ revokedAt: evaluationTime }))
      const deniedAt = revoked ? evaluationTime : grantEnd
      assert.equal((await getChaseAllowanceStatus(f.tx, "tenant-a", deniedAt))?.accessAllowed, false)
      // Extending the supplied old window still counts the old first chase.
      f.grants.set("tenant-a", grant({ expiresAt: new Date("2026-11-01T00:00:00Z") }))
      assert.equal((await getChaseAllowanceStatus(f.tx, "tenant-a", deniedAt))?.usage, 1)
      // A genuinely fresh snapshot excludes the old invoice without rewriting
      // its lifetime firstChasedAt or charging it again on resumed stages.
      f.grants.set("tenant-a", grant({ startsAt: deniedAt, expiresAt: new Date("2026-11-01T00:00:00Z") }))
      f.invoices.push({ userId: "tenant-a", firstChasedAt: deniedAt })
      const fresh = await getChaseAllowanceStatus(f.tx, "tenant-a", deniedAt)
      assert.deepEqual(fresh?.period.start, deniedAt)
      assert.equal(fresh?.usage, 1)
      assert.deepEqual(f.invoices[0].firstChasedAt, grantStart)
    }
  })

  test("paid/Stripe trial/grace precedence never borrows a longer grant's window or limit", async () => {
    for (const subscriptionStatus of ["active", "trialing", "past_due"]) {
      const f = fixture()
      const profile = account({ subscriptionStatus, stripeSubscriptionId: "sub-a", subscriptionTier: "essentials",
        subscriptionCurrentPeriodStart: new Date("2026-10-01T00:00:00Z"),
        subscriptionCurrentPeriodEnd: new Date("2026-11-01T00:00:00Z"), trialEndsAt: new Date("2026-10-15T00:00:00Z") })
      f.profiles.set("tenant-a", profile)
      f.grants.set("tenant-a", grant({ plan: "business_pro", expiresAt: new Date("2026-12-01T00:00:00Z") }))
      const status = await getChaseAllowanceStatus(f.tx, "tenant-a", evaluationTime)
      assert.equal(status?.allowance, 10)
      assert.deepEqual(status?.period, resolveAllowancePeriod(profile, evaluationTime))
      assert.deepEqual((await getChaseAllowanceStatusesForUsers(f.tx, ["tenant-a"], evaluationTime)).get("tenant-a"), status)
    }
  })

  test("denied states have no usable fallback quota but preserve historical accounting", async () => {
    const cases: { profile?: Partial<AllowanceAccountSnapshot>; grant?: TrialGrantSnapshot | null; risk?: BillingRiskSnapshot }[] = [
      { grant: null }, { grant: grant({ expiresAt: evaluationTime }) },
      { grant: grant({ startsAt: new Date(evaluationTime.getTime() + 1) }) },
      { grant: grant({ revokedAt: evaluationTime }) }, { grant: grant({ plan: "accountant_partner" }) },
      { grant: grant({ plan: "solo" }) }, { grant: grant({ plan: "unknown" }) },
      ...["unpaid", "incomplete", "incomplete_expired", "unexpected"].map((subscriptionStatus) => ({ profile: { subscriptionStatus, stripeSubscriptionId: "sub-a" } })),
      { profile: { subscriptionStatus: "active" }, grant: null },
      { profile: { subscriptionStatus: "active", stripeSubscriptionId: "sub-a", subscriptionTier: "unknown" } },
      { profile: { subscriptionStatus: "trialing", trialEndsAt: evaluationTime }, grant: null },
      { risk: { kind: "subscription_invoice", stripeStatus: "open", blocking: true } },
      { risk: { kind: "subscription_dispute", stripeStatus: "lost", blocking: false } },
      { risk: { kind: "subscription_dispute", stripeStatus: "future", blocking: false } },
    ]
    for (const item of cases) {
      const f = fixture()
      const profile = account({ subscriptionCurrentPeriodStart: null, subscriptionCurrentPeriodEnd: null, ...item.profile })
      f.profiles.set("tenant-a", profile)
      if (item.grant === null) f.grants.delete("tenant-a")
      else if (item.grant) f.grants.set("tenant-a", item.grant)
      if (item.risk) f.risks.set("tenant-a", [item.risk])
      f.invoices.push({ userId: "tenant-a", firstChasedAt: evaluationTime })
      const status = await getChaseAllowanceStatus(f.tx, "tenant-a", evaluationTime)
      assert.deepEqual(status, { period: resolveAllowancePeriod(profile, evaluationTime), accessAllowed: false,
        allowance: 0, usage: 1, remaining: 0, atCapacity: true, nearLimit: false }, JSON.stringify(item))
      assert.deepEqual(computeChaseAllowanceStatus({ ...profile, grant: f.grants.get("tenant-a"), billingRisks: f.risks.get("tenant-a") },
        [evaluationTime], evaluationTime), status)
      assert.deepEqual((await getChaseAllowanceStatusesForUsers(f.tx, ["tenant-a"], evaluationTime)).get("tenant-a"), status)
    }
    assert.equal(getInvoiceLimitForTier(null), 10, "pure catalog defaults remain unchanged")
  })

  test("onboarding access survives grant revocation with its own tier and trial window", async () => {
    const f = fixture()
    const profile = account({ subscriptionStatus: "trialing", subscriptionTier: "small_business", stripeSubscriptionId: null,
      subscriptionCurrentPeriodStart: null, subscriptionCurrentPeriodEnd: null,
      createdAt: new Date("2026-10-01T00:00:00Z"), trialEndsAt: new Date("2026-11-01T00:00:00Z") })
    f.profiles.set("tenant-a", profile)
    assert.deepEqual((await getChaseAllowanceStatus(f.tx, "tenant-a", evaluationTime))?.period, { start: grantStart, end: grantEnd })
    f.grants.set("tenant-a", grant({ revokedAt: evaluationTime }))
    const fallback = await getChaseAllowanceStatus(f.tx, "tenant-a", evaluationTime)
    assert.equal(fallback?.accessAllowed, true)
    assert.equal(fallback?.allowance, 250)
    assert.deepEqual(fallback?.period, { start: profile.createdAt, end: profile.trialEndsAt })
  })

  test("batch has three safe scoped reads, deduplicates users and matches singles across different windows", async () => {
    const f = fixture()
    f.profiles.set("tenant-b", account({ subscriptionStatus: "active", stripeSubscriptionId: "sub-b", subscriptionTier: "business_pro",
      subscriptionCurrentPeriodStart: new Date("2026-10-01T00:00:00Z"), subscriptionCurrentPeriodEnd: new Date("2026-11-01T00:00:00Z") }))
    f.profiles.set("tenant-c", account({ subscriptionCurrentPeriodStart: null, subscriptionCurrentPeriodEnd: null }))
    f.risks.set("tenant-c", [{ kind: "subscription_dispute", stripeStatus: "lost", blocking: true }])
    f.grants.set("missing", grant())
    f.invoices.push(
      { userId: "tenant-a", firstChasedAt: grantStart },
      { userId: "tenant-b", firstChasedAt: grantStart },
      { userId: "tenant-b", firstChasedAt: evaluationTime },
      { userId: "tenant-b", firstChasedAt: new Date("2026-11-01T00:00:00Z") },
      { userId: "tenant-c", firstChasedAt: evaluationTime },
      { userId: "unrequested", firstChasedAt: evaluationTime },
    )
    const batch = await getChaseAllowanceStatusesForUsers(f.prisma, ["tenant-a", "tenant-b", "tenant-c", "missing", "tenant-a"], evaluationTime)
    assert.equal(batch.size, 3)
    assert.deepEqual(f.reads.map((read) => read.model), ["userProfile", "tenantBillingRisk", "trackedInvoice"])
    assert.deepEqual(f.reads[0].args.where, { userId: { in: ["tenant-a", "tenant-b", "tenant-c", "missing"] } })
    assert.deepEqual(f.reads[1].args.where, { userId: { in: ["tenant-a", "tenant-b", "tenant-c"] } })
    assert.deepEqual(f.reads[2].args.where, { userId: { in: ["tenant-a", "tenant-b", "tenant-c"] }, firstChasedAt: { gte: grantStart } })
    assert.equal(batch.get("tenant-a")?.usage, 1)
    assert.equal(batch.get("tenant-b")?.usage, 1)
    assert.equal(batch.get("tenant-c")?.accessAllowed, false)
    for (const [userId, status] of batch) {
      f.reads.length = 0
      assert.deepEqual(await getChaseAllowanceStatus(f.tx, userId, evaluationTime), status)
      assert.equal(f.reads.length, 3)
      assert.ok(f.reads.every((read) => read.args.where.userId === userId))
      assert.deepEqual(await getChaseAllowanceStatusForAccount(f.tx, userId, f.profiles.get(userId)!, evaluationTime), status)
    }
    assert.equal(await getChaseAllowanceStatus(f.tx, "missing", evaluationTime), null)
  })

  test("empty/missing batches avoid unnecessary reads and unavailable facts propagate rather than authorize", async () => {
    const f = fixture()
    assert.deepEqual(await getChaseAllowanceStatusesForUsers(f.tx, [], evaluationTime), new Map())
    assert.equal(f.reads.length, 0)
    assert.deepEqual(await getChaseAllowanceStatusesForUsers(f.tx, ["missing"], evaluationTime), new Map())
    assert.equal(f.reads.length, 1)
    const unavailable = mock.method(f.client.tenantBillingRisk, "findMany", async () => { throw new Error("Risk unavailable") })
    try {
      await assert.rejects(getChaseAllowanceStatus(f.tx, "tenant-a", evaluationTime), /Risk unavailable/)
      await assert.rejects(getChaseAllowanceStatusesForUsers(f.tx, ["tenant-a"], evaluationTime), /Risk unavailable/)
    } finally { unavailable.mock.restore() }
  })

  test("non-grant sources preserve Melbourne DST/year boundaries and stale/missing Stripe trial dates", async () => {
    for (const [now, start, end] of [
      ["2026-10-14T12:00:00Z", "2026-09-30T14:00:00Z", "2026-10-31T13:00:00Z"],
      ["2026-04-14T12:00:00Z", "2026-03-31T13:00:00Z", "2026-04-30T14:00:00Z"],
      ["2026-12-31T13:00:00Z", "2026-12-31T13:00:00Z", "2027-01-31T13:00:00Z"],
    ]) {
      for (const trialEndsAt of [null, new Date("2020-01-01T00:00:00Z")]) {
        const f = fixture()
        f.grants.clear()
        const instant = new Date(now)
        f.profiles.set("tenant-a", account({ subscriptionStatus: "trialing", stripeSubscriptionId: "sub-a",
          subscriptionCurrentPeriodStart: null, subscriptionCurrentPeriodEnd: null, trialEndsAt }))
        f.invoices.push({ userId: "tenant-a", firstChasedAt: new Date(start) }, { userId: "tenant-a", firstChasedAt: new Date(end) })
        const status = await getChaseAllowanceStatus(f.tx, "tenant-a", instant)
        assert.deepEqual(status?.period, { start: new Date(start), end: new Date(end) })
        assert.equal(status?.accessAllowed, true, "Stripe trialing remains authoritative")
        assert.equal(status?.usage, 1)
        assert.deepEqual((await getChaseAllowanceStatusesForUsers(f.tx, ["tenant-a"], instant)).get("tenant-a"), status)
      }
    }
  })
})
