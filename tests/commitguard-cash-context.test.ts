import assert from "node:assert/strict"
import { describe, test } from "node:test"
import {
  COMMIT_GUARD_CURRENCIES,
  createCommitGuardCashContextSchema,
  getCommitGuardInputFreshness,
  toCommitGuardCashContextDto,
  type CommitGuardCashContextRecord,
} from "@/lib/commitguard/cashContext"

const now = new Date("2026-10-19T23:59:59.999Z")
const schema = createCommitGuardCashContextSchema(now)
const balance = { amountCents: 500_000, currency: "aud", balanceAsOf: "2026-10-19" }
const expenses = {
  weeklyOperatingExpensesCents: 20_000,
  weeklyExpensesCurrency: "usd",
  weeklyExpensesAsOf: "2026-10-19",
}
const row: CommitGuardCashContextRecord = {
  ...balance,
  balanceAsOf: new Date("2026-10-19T00:00:00Z"),
  ...expenses,
  weeklyExpensesAsOf: new Date("2026-10-19T00:00:00Z"),
  taxProtectionCurrency: "nzd",
  revision: 3,
}

describe("CommitGuard pure cash-context validation", () => {
  test("accepts known zero, negative cash, and both signed Prisma Int boundaries", () => {
    for (const amountCents of [0, -1, -2_147_483_648, 2_147_483_647]) {
      assert.equal(schema.parse({ ...balance, amountCents, expectedRevision: 0 }).amountCents, amountCents)
    }
  })

  test("rejects overflow, unsafe numbers, fractions, nonfinite amounts, and coercion", () => {
    for (const amountCents of [-2_147_483_649, 2_147_483_648, Number.MAX_SAFE_INTEGER + 1, 0.1, NaN, Infinity, "0", false]) {
      assert.equal(schema.safeParse({ ...balance, amountCents, expectedRevision: 0 }).success, false)
    }
  })

  test("accepts exactly the eight lowercase currencies in every independent currency field", () => {
    assert.deepEqual(COMMIT_GUARD_CURRENCIES, ["aud", "usd", "nzd", "gbp", "eur", "cad", "sgd", "hkd"])
    for (const currency of COMMIT_GUARD_CURRENCIES) {
      assert.equal(schema.safeParse({ ...balance, currency, ...expenses, weeklyExpensesCurrency: currency, taxProtectionCurrency: currency, expectedRevision: 0 }).success, true)
    }
    for (const currency of ["AUD", " aud", "aud ", "jpy", "chf", "btc", "", "xxx"]) {
      for (const invalid of [{ ...balance, currency }, { ...expenses, weeklyExpensesCurrency: currency }, { taxProtectionCurrency: currency }]) {
        assert.equal(schema.safeParse({ ...invalid, expectedRevision: 0 }).success, false)
      }
    }
    assert.equal(schema.safeParse({ ...balance, ...expenses, taxProtectionCurrency: "hkd", expectedRevision: 0 }).success, true)
  })

  test("requires all-or-none groups, including when amounts are zero", () => {
    for (const group of [balance, expenses]) {
      const entries = Object.entries(group)
      for (let mask = 1; mask < 7; mask++) {
        const partial = Object.fromEntries(entries.filter((_, index) => mask & (1 << index)))
        const mixedNulls = Object.fromEntries(entries.map(([key, value], index) => [key, mask & (1 << index) ? value : null]))
        const partialNulls = Object.fromEntries(Object.keys(partial).map((key) => [key, null]))
        for (const input of [partial, mixedNulls, partialNulls]) {
          assert.equal(schema.safeParse({ ...input, expectedRevision: 0 }).success, false)
        }
      }
    }
    assert.equal(schema.safeParse({ amountCents: 0, expectedRevision: 0 }).success, false)
  })

  test("expense basis accepts explicit zero and maximum Int but not negative or overflow", () => {
    for (const weeklyOperatingExpensesCents of [0, 2_147_483_647]) {
      assert.equal(schema.safeParse({ ...expenses, weeklyOperatingExpensesCents, expectedRevision: 0 }).success, true)
    }
    for (const weeklyOperatingExpensesCents of [-1, 2_147_483_648, 1.5, "0"]) {
      assert.equal(schema.safeParse({ ...expenses, weeklyOperatingExpensesCents, expectedRevision: 0 }).success, false)
    }
  })

  test("requires an explicit bounded expected revision and rejects identity/internal fields", () => {
    assert.equal(schema.safeParse(balance).success, false)
    for (const expectedRevision of [-1, 1.5, "0", null, 2_147_483_648]) {
      assert.equal(schema.safeParse({ ...balance, expectedRevision }).success, false)
    }
    assert.equal(schema.safeParse({ ...balance, expectedRevision: 2_147_483_647 }).success, true)
    for (const field of ["userId", "tenantId", "id", "revision", "source", "freshness", "createdAt", "updatedAt", "leaseOwner"]) {
      assert.equal(schema.safeParse({ ...balance, expectedRevision: 0, [field]: "forged" }).success, false)
    }
  })

  test("omitted groups stay omitted; clears require explicit nulls and preserve independent inputs", () => {
    assert.deepEqual(schema.parse({ expectedRevision: 3 }), { expectedRevision: 3 })
    const clear = { amountCents: null, currency: null, balanceAsOf: null }
    assert.deepEqual(schema.parse({ ...clear, expectedRevision: 3 }), { ...clear, expectedRevision: 3 })
    assert.deepEqual(schema.parse({ ...clear, ...expenses, taxProtectionCurrency: "hkd", expectedRevision: 3 }), {
      ...clear, ...expenses, taxProtectionCurrency: "hkd", expectedRevision: 3,
    })
    const clearExpenses = { weeklyOperatingExpensesCents: null, weeklyExpensesCurrency: null, weeklyExpensesAsOf: null }
    assert.deepEqual(schema.parse({ ...balance, ...clearExpenses, taxProtectionCurrency: null, expectedRevision: 3 }), {
      ...balance, ...clearExpenses, taxProtectionCurrency: null, expectedRevision: 3,
    })
    assert.deepEqual(schema.parse({ ...balance, ...expenses, currency: "cad", expectedRevision: 3 }).weeklyExpensesCurrency, "usd")
  })

  test("validates real UTC calendar dates, including leap years, without timestamp coercion", () => {
    for (const date of ["2024-02-29", "2000-02-29", "2026-10-19"]) {
      assert.equal(schema.safeParse({ ...balance, balanceAsOf: date, ...expenses, weeklyExpensesAsOf: date, expectedRevision: 0 }).success, true)
    }
    for (const date of ["2026-10-20", "2026-02-29", "1900-02-29", "2024-02-30", "2026-04-31", "2026-13-01", "2026-00-01", "2026-01-00", "2026-1-01", "19/10/2026", "2026-10-19T00:00:00Z", "2026-10-19T00:00:00+10:00", ""]) {
      for (const input of [{ ...balance, balanceAsOf: date }, { ...expenses, weeklyExpensesAsOf: date }]) {
        assert.equal(schema.safeParse({ ...input, expectedRevision: 0 }).success, false, date)
      }
    }
  })
})

describe("CommitGuard cash-context freshness and safe DTO", () => {
  test("day zero and day seven are fresh; day eight is stale independent of evaluation hour", () => {
    for (const clock of [new Date("2026-10-19T00:00:00Z"), now]) {
      assert.equal(getCommitGuardInputFreshness("2026-10-19", clock), "fresh")
      assert.equal(getCommitGuardInputFreshness("2026-10-12", clock), "fresh")
      assert.equal(getCommitGuardInputFreshness("2026-10-11", clock), "stale")
    }
    assert.equal(getCommitGuardInputFreshness("2024-02-29", new Date("2024-03-07T23:00:00Z")), "fresh")
    assert.equal(getCommitGuardInputFreshness("2024-02-29", new Date("2024-03-08T00:00:00Z")), "stale")
    assert.equal(getCommitGuardInputFreshness(null, now), "missing")
    assert.throws(() => getCommitGuardInputFreshness("2026-10-20", now))
    assert.throws(() => getCommitGuardInputFreshness("2026-02-29", now))
  })

  test("uses the UTC date even when the supplied clock has a non-UTC offset", () => {
    const clock = new Date("2026-10-20T00:30:00+14:00")
    assert.equal(createCommitGuardCashContextSchema(clock).safeParse({ ...balance, balanceAsOf: "2026-10-20", expectedRevision: 0 }).success, false)
    assert.equal(getCommitGuardInputFreshness("2026-10-12", clock), "fresh")
  })

  test("absent row is missing with null inputs and initial revision, not zero", () => {
    assert.deepEqual(toCommitGuardCashContextDto(null, now), {
      amountCents: null, currency: null, balanceAsOf: null,
      weeklyOperatingExpensesCents: null, weeklyExpensesCurrency: null, weeklyExpensesAsOf: null,
      taxProtectionCurrency: null, revision: 0, asOf: "2026-10-19", source: "owner_entered",
      freshness: "missing", weeklyExpensesFreshness: "missing",
    })
  })

  test("zero/negative cash and zero expenses remain known; DTO omits tenant and internal metadata", () => {
    for (const amountCents of [0, -500]) {
      const dto = toCommitGuardCashContextDto({ ...row, amountCents, weeklyOperatingExpensesCents: 0, userId: "private", id: "internal", createdAt: now } as CommitGuardCashContextRecord, now)
      assert.equal(dto.amountCents, amountCents)
      assert.equal(dto.weeklyOperatingExpensesCents, 0)
      assert.equal(dto.freshness, "fresh")
      assert.equal(dto.weeklyExpensesFreshness, "fresh")
      assert.equal(dto.balanceAsOf, "2026-10-19")
      assert.equal(dto.weeklyExpensesAsOf, "2026-10-19")
      assert.equal(dto.source, "owner_entered")
      assert.equal(dto.revision, 3)
      for (const key of ["userId", "tenantId", "id", "createdAt", "updatedAt"]) assert.equal(key in dto, false)
    }
  })

  test("balance and expense freshness are independent and stale amounts remain visible", () => {
    const staleBalance = toCommitGuardCashContextDto({ ...row, balanceAsOf: new Date("2026-10-11T00:00:00Z") }, now)
    assert.equal(staleBalance.amountCents, 500_000)
    assert.equal(staleBalance.balanceAsOf, "2026-10-11")
    assert.equal(staleBalance.freshness, "stale")
    assert.equal(staleBalance.weeklyExpensesFreshness, "fresh")
    const staleExpenses = toCommitGuardCashContextDto({ ...row, weeklyExpensesAsOf: new Date("2026-10-11T00:00:00Z") }, now)
    assert.equal(staleExpenses.weeklyOperatingExpensesCents, 20_000)
    assert.equal(staleExpenses.weeklyExpensesFreshness, "stale")
    assert.equal(staleExpenses.freshness, "fresh")
  })

  test("cleared cash retains independently attested expense and tax currencies", () => {
    const dto = toCommitGuardCashContextDto({ ...row, amountCents: null, currency: null, balanceAsOf: null }, now)
    assert.equal(dto.freshness, "missing")
    assert.equal(dto.weeklyExpensesCurrency, "usd")
    assert.equal(dto.taxProtectionCurrency, "nzd")
    assert.equal(dto.weeklyOperatingExpensesCents, 20_000)
  })

  test("does not silently manufacture a usable DTO from invalid stored groups or currencies", () => {
    assert.throws(() => toCommitGuardCashContextDto({ ...row, currency: null }, now))
    assert.throws(() => toCommitGuardCashContextDto({ ...row, currency: "jpy" }, now))
    assert.throws(() => toCommitGuardCashContextDto({ ...row, balanceAsOf: new Date("2026-10-20T00:00:00Z") }, now))
  })
})