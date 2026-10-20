import assert from "node:assert/strict"
import { describe, test } from "node:test"
import {
  cashContextDraft, parseCashContextAmount, requestCashContext, saveCashContextDraft, validateCashContextDraft,
  type CashContextRequest,
} from "@/lib/commitguard/cashContextClient"
import { toCommitGuardCashContextDto, type CommitGuardCashContextDto } from "@/lib/commitguard/cashContext"

const now = new Date("2026-10-19T12:00:00Z")
const empty = toCommitGuardCashContextDto(null, now)
const saved: CommitGuardCashContextDto = { ...empty, amountCents: -29, currency: "usd", balanceAsOf: "2026-10-19", freshness: "fresh", revision: 1 }
const response = (context = saved): Response => Response.json({ cashContext: context })

describe("CommitGuard cash context client", () => {
  test("converts decimal amounts exactly, including zero, signed cents and Prisma Int endpoints", () => {
    for (const [value, expected] of [["0", 0], ["0.29", 29], ["-0.29", -29], ["1.01", 101], ["-21474836.48", -2147483648], ["21474836.47", 2147483647]] as const) {
      assert.equal(parseCashContextAmount(value), expected)
    }
    for (const value of ["", "1e2", "0x10", "1,000", ".5", "12.", "1.001", "Infinity", "NaN", "21474836.48", "-21474836.49", "999999999999999999999999999999999999999"]) {
      assert.equal(parseCashContextAmount(value), null, value)
    }
    assert.equal(parseCashContextAmount("-0.01", true), null)
    assert.equal(parseCashContextAmount("0", true), 0)
  })

  test("round trips saved zero and negative drafts without treating them as missing", () => {
    for (const amountCents of [0, -29, -2147483648, 2147483647]) {
      const draft = cashContextDraft({ ...saved, amountCents })
      const result = validateCashContextDraft(draft, 4, now)
      assert.equal(result.input?.amountCents, amountCents)
      assert.equal(result.input?.expectedRevision, 4)
    }
  })

  test("clears complete groups and keeps currencies independent", () => {
    const result = validateCashContextDraft({ ...cashContextDraft(empty), weeklyAmount: "200.00", weeklyCurrency: "aud", weeklyAsOf: "2026-10-18", taxCurrency: "nzd" }, 2, now)
    assert.deepEqual(result.input, { expectedRevision: 2, amountCents: null, currency: null, balanceAsOf: null, weeklyOperatingExpensesCents: 20000, weeklyExpensesCurrency: "aud", weeklyExpensesAsOf: "2026-10-18", taxProtectionCurrency: "nzd" })
    const cleared = validateCashContextDraft(cashContextDraft(empty), 3, now)
    assert.equal(cleared.input?.weeklyOperatingExpensesCents, null)
    assert.equal(cleared.input?.weeklyExpensesCurrency, null)
    assert.equal(cleared.input?.weeklyExpensesAsOf, null)
    assert.equal(cleared.input?.taxProtectionCurrency, null)
  })

  test("validates partial groups, unsupported currencies, future/invalid dates and nonnegative expenses inline", () => {
    const result = validateCashContextDraft({ ...cashContextDraft(empty), amount: "0", currency: "jpy", balanceAsOf: "2026-10-20", weeklyAmount: "-1", weeklyCurrency: "", weeklyAsOf: "2026-02-30", taxCurrency: "xxx" }, 0, now)
    assert.deepEqual(Object.keys(result.errors ?? {}).sort(), ["currency", "balanceAsOf", "weeklyAmount", "weeklyCurrency", "weeklyAsOf", "taxCurrency"].sort())
    assert.ok(validateCashContextDraft({ ...cashContextDraft(empty), currency: "aud" }, 0, now).errors?.amount)
  })

  test("accepts exactly the eight supported currencies", () => {
    for (const currency of ["aud", "usd", "nzd", "gbp", "eur", "cad", "sgd", "hkd"]) {
      assert.ok(validateCashContextDraft({ ...cashContextDraft(saved), currency }, 0, now).input)
    }
  })

  test("409 preserves drafts and makes no read, refresh or automatic second mutation", async () => {
    const draft = cashContextDraft(saved)
    const calls: RequestInit[] = []
    const result = await saveCashContextDraft(async (_url, init) => { calls.push(init!); return new Response("private server details", { status: 409 }) }, { expectedRevision: 0 }, () => assert.fail("Not saved"), () => assert.fail("No refresh"))
    assert.deepEqual(result, { kind: "conflict" })
    assert.equal(calls.length, 1)
    assert.equal(calls[0].method, "PUT")
    assert.deepEqual(draft, cashContextDraft(saved))
  })

  test("save success followed by failed GET retains saved DTO; retry is GET only", async () => {
    const methods: string[] = []
    let callback: CommitGuardCashContextDto | undefined
    const request: CashContextRequest = async (_url, init) => {
      methods.push(init?.method ?? "GET")
      return methods.length === 2 ? new Response(null, { status: 503 }) : response()
    }
    let refreshes = 0
    const result = await saveCashContextDraft(request, { expectedRevision: 0 }, (dto) => { callback = dto }, () => { refreshes++ })
    assert.equal(refreshes, 1, "independent read failure must not skip workspace/server refresh")
    assert.equal(result.kind, "saved")
    if (result.kind === "saved") { assert.equal(result.refreshFailed, true); assert.deepEqual(result.context, saved) }
    assert.deepEqual(callback, saved)
    assert.deepEqual(await requestCashContext(request), saved)
    assert.deepEqual(methods, ["PUT", "GET", "GET"])
  })

  test("successful save/refetch refreshes server once and exposes competing revision for explicit review", async () => {
    let count = 0
    let refreshes = 0
    const result = await saveCashContextDraft(async () => response(++count === 1 ? saved : { ...saved, revision: 2, amountCents: 100 }), { expectedRevision: 0 }, () => {}, () => { refreshes++ })
    assert.equal(result.kind, "saved")
    if (result.kind === "saved") { assert.equal(result.savedRevision, 1); assert.equal(result.context.revision, 2) }
    assert.equal(refreshes, 1)
  })

  test("a synchronous server-refresh failure never repeats PUT", async () => {
    let calls = 0
    const result = await saveCashContextDraft(async () => { calls++; return response() }, { expectedRevision: 0 }, () => {}, () => { throw new Error("refresh failed") })
    assert.equal(result.kind === "saved" && result.refreshFailed, true)
    assert.equal(calls, 2)
  })

  test("handles denied/error/network/malformed responses safely without mutation retries", async () => {
    for (const status of [400, 401, 403, 500, 503]) {
      const result = await saveCashContextDraft(async () => new Response("secret", { status }), { expectedRevision: 0 }, () => assert.fail(), () => assert.fail())
      assert.deepEqual(result, { kind: "failed" })
    }
    assert.deepEqual(await saveCashContextDraft(async () => { throw new Error("offline") }, { expectedRevision: 0 }, () => assert.fail(), () => assert.fail()), { kind: "failed" })
    await assert.rejects(requestCashContext(async () => Response.json({ cashContext: { ...saved, amountCents: null } })))
    await assert.rejects(requestCashContext(async () => Response.json({ cashContext: { ...saved, userId: "private" } })))
  })
})