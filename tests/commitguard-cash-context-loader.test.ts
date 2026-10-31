import assert from "node:assert/strict"
import { before, beforeEach, describe, mock, test } from "node:test"
import type { CommitGuardCashContextRecord } from "@/lib/commitguard/cashContext"

const now = new Date("2026-10-19T12:00:00Z")
const rows = new Map<string, CommitGuardCashContextRecord>([
  ["tenant-a", {
    amountCents: -500, currency: "aud", balanceAsOf: new Date("2026-10-12T00:00:00Z"),
    weeklyOperatingExpensesCents: 0, weeklyExpensesCurrency: "usd", weeklyExpensesAsOf: new Date("2026-10-11T00:00:00Z"),
    taxProtectionCurrency: "nzd", revision: 4,
  }],
  ["tenant-b", {
    amountCents: 0, currency: "cad", balanceAsOf: new Date("2026-10-19T00:00:00Z"),
    weeklyOperatingExpensesCents: null, weeklyExpensesCurrency: null, weeklyExpensesAsOf: null,
    taxProtectionCurrency: null, revision: 2,
  }],
])
const profiles = new Map<string, { accountDisplayFromDate: Date | null; accountDisplayRevision: number; accountDisplayTimeZone: string }>()
const calls: { userId: string; query: unknown }[] = []
let load: typeof import("@/lib/commitguard/cashContextLoader").loadCommitGuardCashContext
let readError: Error | null = null

describe("CommitGuard tenant cash-context loader", () => {
  beforeEach(() => {
    profiles.clear()
  })

  before(async () => {
    // Install before dynamic import: no real Prisma/environment initialization.
    await mock.module("@/lib/db/withUserContext", {
      namedExports: {
        withUserContext: async <T>(userId: string, fn: (tx: {
          commitGuardCashContext: { findUnique: (query: { where: { userId: string }; select: object }) => Promise<CommitGuardCashContextRecord | null> }
          userProfile: { findUnique: (query: { where: { userId: string }; select: { accountDisplayFromDate: true; accountDisplayRevision: true; accountDisplayTimeZone: true } }) => Promise<{ accountDisplayFromDate: Date | null; accountDisplayRevision: number; accountDisplayTimeZone: string } | null> }
        }) => Promise<T>): Promise<T> => fn({
          commitGuardCashContext: {
            findUnique: async (query) => {
              assert.equal(query.where.userId, userId)
              calls.push({ userId, query })
              if (readError) throw readError
              return rows.get(userId) ?? null
            },
          },
          userProfile: {
            findUnique: async (query) => {
              assert.equal(query.where.userId, userId)
              return profiles.get(userId) ?? null
            },
          },
        }),
      },
    })
    // These fail-fast guards prove that even denied Tax Buffer access is irrelevant.
    await mock.module("@/lib/billing", { namedExports: {
      requireFeature: () => { throw new Error("Unexpected entitlement dependency") },
    } })
    await mock.module("@/lib/taxBuffer/service", { namedExports: {
      loadTaxBufferSummary: () => { throw new Error("Unexpected Tax Buffer dependency") },
    } })
    ;({ loadCommitGuardCashContext: load } = await import("@/lib/commitguard/cashContextLoader"))
  })

  test("reads only selected safe fields under the caller's tenant context without writes", async () => {
    const dto = await load("tenant-a", now)
    assert.deepEqual(calls.at(-1), {
      userId: "tenant-a",
      query: { where: { userId: "tenant-a" }, select: {
        amountCents: true, currency: true, balanceAsOf: true,
        weeklyOperatingExpensesCents: true, weeklyExpensesCurrency: true, weeklyExpensesAsOf: true,
        taxProtectionCurrency: true, revision: true,
      } },
    })
    assert.equal(dto.amountCents, -500)
    assert.equal(dto.freshness, "fresh")
    assert.equal(dto.weeklyOperatingExpensesCents, 0)
    assert.equal(dto.weeklyExpensesFreshness, "stale")
    assert.equal(dto.balanceAsOf, "2026-10-12")
    assert.equal(dto.source, "owner_entered")
    assert.equal(dto.revision, 4)
    assert.equal("userId" in dto, false)
  })

  test("separate mocked tenants receive their own saved balance, including explicit zero", async () => {
    const dto = await load("tenant-b", now)
    assert.equal(dto.amountCents, 0)
    assert.equal(dto.currency, "cad")
    assert.equal(dto.weeklyExpensesFreshness, "missing")
    assert.equal(dto.taxProtectionCurrency, null)
    assert.equal(dto.revision, 2)
    assert.equal(calls.at(-1)?.userId, "tenant-b")
  })

  test("missing cash needs neither Tax Buffer access nor a default-row write", async () => {
    const dto = await load("tenant-without-cash-or-tax-buffer", now)
    assert.equal(dto.amountCents, null)
    assert.equal(dto.currency, null)
    assert.equal(dto.freshness, "missing")
    assert.equal(dto.revision, 0)
  })

  test("filters a pre-cutoff cash anchor instead of inventing a current balance", async () => {
    profiles.set("tenant-a", { accountDisplayFromDate: new Date("2026-10-15T00:00:00Z"), accountDisplayRevision: 9, accountDisplayTimeZone: "Australia/Melbourne" })
    const dto = await load("tenant-a", new Date("2026-10-20T00:00:00Z"))
    assert.equal(dto.amountCents, null)
    assert.equal(dto.currency, null)
    assert.equal(dto.balanceAsOf, null)
    assert.equal(dto.freshness, "missing")
    assert.equal(dto.revision, 0)
  })

  test("retains a current dated anchor on or after the active cutoff", async () => {
    profiles.set("tenant-a", { accountDisplayFromDate: new Date("2026-10-12T00:00:00Z"), accountDisplayRevision: 9, accountDisplayTimeZone: "Australia/Melbourne" })
    const dto = await load("tenant-a", now)
    assert.equal(dto.amountCents, -500)
    assert.equal(dto.balanceAsOf, "2026-10-12")
    assert.equal(dto.freshness, "fresh")
  })

  test("uses the injected clock on subsequent reads rather than caching freshness", async () => {
    const dto = await load("tenant-a", new Date("2026-10-20T00:00:00Z"))
    assert.equal(dto.freshness, "stale")
    assert.equal(dto.amountCents, -500)
  })

  test("propagates read failure instead of fabricating missing or zero cash", async () => {
    readError = new Error("mock transaction failure")
    try {
      await assert.rejects(load("tenant-a", now), /mock transaction failure/)
    } finally {
      readError = null
    }
  })
})