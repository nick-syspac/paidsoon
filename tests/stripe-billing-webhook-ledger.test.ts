import { before, beforeEach, describe, mock, test } from "node:test"
import assert from "node:assert/strict"
import Stripe from "stripe"
import { WebhookLedgerMock } from "@/tests/helpers/webhookLedgerMock"

const secret = "whsec_ledger_test_only"
const signing = new Stripe("sk_test_dummy", { apiVersion: "2026-05-27.dahlia" })
let ledger = new WebhookLedgerMock()
let writes: Record<string, unknown>[]
let reads: number
let failWrite: boolean
let failInitialize: boolean
let retrieve: () => Promise<unknown>
let beforeFinish: (() => void) | undefined
let POST: typeof import("@/app/api/webhooks/stripe-billing/route").POST
let api: typeof import("@/lib/billing/webhookLedger")
const profile = { userId: "tenant", stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_1", pendingDowngradeTier: null }
const subscription = {
  id: "sub_1", customer: "cus_1", status: "trialing", metadata: {},
  trial_end: 2_000_000_000, cancel_at: null, cancel_at_period_end: false,
  items: { data: [{ price: { id: "price_control" } }] }, latest_invoice: null,
}
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function request(id = "evt_1", type = "customer.subscription.updated", object: unknown = subscription): Request {
  const payload = JSON.stringify({ id, type, created: 1, data: { object } })
  return new Request("http://localhost/api/webhooks/stripe-billing", { method: "POST", body: payload,
    headers: { "stripe-signature": signing.webhooks.generateTestHeaderString({ payload, secret }) } })
}
async function unavailable(response: Response): Promise<void> {
  assert.equal(response.status, 503)
  assert.deepEqual(await response.json(), { error: "Billing reconciliation unavailable" })
  assert.equal(response.headers.get("retry-after"), "60")
}

describe("signed retryable billing webhook ledger", () => {
  before(async () => {
    process.env.STRIPE_BILLING_WEBHOOK_SECRET = secret
    process.env.STRIPE_SOLO_PRICE_ID = "price_control"
    await mock.module("server-only", { namedExports: {} })
    const webhookDelegate = {
      create: (args: Parameters<typeof ledger.delegate.create>[0]) => ledger.delegate.create(args),
      findUnique: (args: Parameters<typeof ledger.delegate.findUnique>[0]) => ledger.delegate.findUnique(args),
      updateMany: (args: Parameters<typeof ledger.delegate.updateMany>[0]) => {
        if (args.data.processingStatus === "processed") beforeFinish?.()
        return ledger.delegate.updateMany(args)
      },
    }
    const userProfile = {
      findFirst: async () => profile,
      findUnique: async () => profile,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        if (failWrite) throw new Error("private database connection string")
        writes.push(data)
        return profile
      },
    }
    const tx = { stripeBillingWebhookEvent: webhookDelegate, userProfile, $executeRawUnsafe: async () => 1 }
    await mock.module("@/lib/db/admin", { namedExports: { prismaAdmin: {
      ...tx, $transaction: async (write: (tx: unknown) => Promise<unknown>) => {
        const beforeWrites = writes.length
        try { return await write(tx) }
        catch (error) { writes.length = beforeWrites; throw error }
      },
    } } })
    await mock.module("@/lib/billing/stripeClient", { namedExports: { createStripeClient: () => {
      if (failInitialize) throw new Error("private configuration failure")
      return { webhooks: signing.webhooks, subscriptions: { retrieve: async () => { reads++; return retrieve() } } }
    } } })
    ;({ POST } = await import("@/app/api/webhooks/stripe-billing/route"))
    api = await import("@/lib/billing/webhookLedger")
  })
  beforeEach(() => {
    ledger = new WebhookLedgerMock(); writes = []; reads = 0; failWrite = false; beforeFinish = undefined
    failInitialize = false
    retrieve = async () => subscription
  })

  for (const status of ["processed", "skipped"]) {
    test(`${status} duplicates return 200 without side effects or a new claim`, async () => {
      const row = ledger.seed("evt_1", status)
      const response = await POST(request())
      assert.equal(response.status, 200)
      assert.deepEqual(await response.json(), { received: true, deduped: true })
      assert.equal(row.processingStatus, status)
      assert.equal(reads, 0); assert.deepEqual(writes, []); assert.deepEqual(ledger.finishes, [])
    })
  }
  for (const status of ["received", "failed", "processing"]) {
    test(`interrupted ${status} with absent lease is reclaimable`, async () => {
      ledger.seed("evt_1", status, { processingToken: "old_executor" })
      assert.equal((await POST(request())).status, 200)
      assert.equal(writes.length, 1); assert.equal(reads, 2)
      assert.equal(ledger.rows.get("evt_1")?.processingStatus, "processed")
      assert.notEqual(ledger.claims[0].data.processingToken, "old_executor")
    })
  }
  test("expired lease reclaims with a new stable token on every commit/finish", async () => {
    ledger.seed("evt_1", "processing", { processingToken: "old", processingLeaseUntil: new Date(0) })
    assert.equal((await POST(request())).status, 200)
    const token = ledger.claims[0].data.processingToken
    assert.equal(typeof token, "string"); assert.notEqual(token, "old")
    assert.ok(ledger.fences.length > 0)
    for (const write of [...ledger.fences, ...ledger.finishes]) assert.equal(write.where.processingToken, token)
    const row = ledger.rows.get("evt_1")!
    assert.equal(row.processingToken, null); assert.equal(row.processingLeaseUntil, null)
    assert.ok(row.processedAt instanceof Date)
  })
  test("live in-flight lease is retryable, not terminal 200", async () => {
    ledger.seed("evt_1", "processing", { processingToken: "owner", processingLeaseUntil: new Date("2100-01-01") })
    await unavailable(await POST(request()))
    assert.equal(reads, 0); assert.deepEqual(writes, []); assert.deepEqual(ledger.finishes, [])
    assert.equal(ledger.rows.get("evt_1")?.processingToken, "owner")
  })
  for (const source of ["provider", "database"]) {
    test(`${source} failure after receipt marks failed and identical redelivery recovers`, async () => {
      if (source === "provider") retrieve = async () => { throw new Error("private provider token") }
      else failWrite = true
      await unavailable(await POST(request()))
      const row = ledger.rows.get("evt_1")!
      assert.equal(row.processingStatus, "failed"); assert.equal(row.processedAt, null)
      assert.equal(row.processingNote, "billing_reconciliation_failed")
      assert.deepEqual(writes, []); assert.equal(ledger.creates.length, 1)
      const oldToken = ledger.claims[0].data.processingToken
      retrieve = async () => subscription; failWrite = false
      assert.equal((await POST(request())).status, 200)
      assert.equal(row.processingStatus, "processed"); assert.equal(writes.length, 1)
      assert.notEqual(ledger.claims[1].data.processingToken, oldToken)
      assert.equal((await POST(request())).status, 200); assert.equal(writes.length, 1)
    })
  }
  test("simultaneous signed deliveries have one executor; the loser retries", async () => {
    const entered = deferred<void>(), release = deferred<unknown>()
    retrieve = async () => { entered.resolve(); return release.promise }
    const first = POST(request())
    const second = POST(request())
    await entered.promise
    await unavailable(await second)
    assert.equal(reads, 1); assert.deepEqual(writes, [])
    release.resolve(subscription)
    assert.equal((await first).status, 200)
    assert.equal(writes.length, 1)
    assert.deepEqual(await (await POST(request())).json(), { received: true, deduped: true })
    assert.equal(reads, 2)
  })
  test("reclaimed executor cannot perform stale profile writes or mark new success failed", async () => {
    const entered = deferred<void>(), release = deferred<unknown>()
    retrieve = async () => { entered.resolve(); return release.promise }
    const old = POST(request()); await entered.promise
    const oldToken = ledger.rows.get("evt_1")!.processingToken
    ledger.rows.get("evt_1")!.processingLeaseUntil = new Date(0)
    retrieve = async () => subscription
    assert.equal((await POST(request())).status, 200)
    release.resolve(subscription)
    await unavailable(await old)
    assert.equal(writes.length, 1)
    assert.equal(ledger.rows.get("evt_1")!.processingStatus, "processed")
    assert.equal(ledger.finishes.at(-1)!.where.processingToken, oldToken)
  })
  test("old thrown error cannot fail a replacement executor's live claim", async () => {
    const oldEntered = deferred<void>(), newEntered = deferred<void>()
    const oldRelease = deferred<unknown>(), newRelease = deferred<unknown>()
    retrieve = async () => { oldEntered.resolve(); return oldRelease.promise }
    const old = POST(request()); await oldEntered.promise
    ledger.rows.get("evt_1")!.processingLeaseUntil = new Date(0)
    retrieve = async () => { newEntered.resolve(); return newRelease.promise }
    const replacement = POST(request()); await newEntered.promise
    const newToken = ledger.rows.get("evt_1")!.processingToken
    oldRelease.reject(new Error("private interrupted error"))
    await unavailable(await old)
    assert.equal(ledger.rows.get("evt_1")!.processingToken, newToken)
    assert.equal(ledger.rows.get("evt_1")!.processingStatus, "processing")
    newRelease.resolve(subscription)
    assert.equal((await replacement).status, 200); assert.equal(writes.length, 1)
  })
  test("lost finish fence never switches to the token read from the replacement row", async () => {
    beforeFinish = () => { ledger.seed("evt_1", "processing", { processingToken: "replacement", processingLeaseUntil: new Date("2100-01-01") }) }
    await unavailable(await POST(request()))
    assert.equal(ledger.rows.get("evt_1")!.processingToken, "replacement")
    assert.equal(ledger.rows.get("evt_1")!.processingStatus, "processing")
    assert.deepEqual(writes, [], "projection rolls back when terminal transition loses its fence")
    for (const finish of ledger.finishes) assert.equal(finish.where.processingToken, ledger.claims[0].data.processingToken)
  })
  test("signed projection and terminal status roll back together on finish outage, then redelivery re-reads", async () => {
    ledger.finishError = true
    await unavailable(await POST(request()))
    assert.equal(writes.length, 0)
    assert.equal(ledger.rows.get("evt_1")!.processingStatus, "processing")
    ledger.finishError = false
    ledger.rows.get("evt_1")!.processingLeaseUntil = new Date(0)
    retrieve = async () => ({ ...subscription, status: "active", trial_end: null })
    assert.equal((await POST(request())).status, 200)
    assert.equal(writes.length, 1); assert.equal(writes[0].subscriptionStatus, "active")
    assert.equal(writes[0].trialEndsAt, null)
    assert.equal(ledger.rows.get("evt_1")!.processingStatus, "processed")
  })
  test("finish DB outage remains retryable and lease recovery is possible", async () => {
    ledger.finishError = true
    await unavailable(await POST(request("evt_observe", "customer.subscription.trial_will_end")))
    assert.equal(ledger.rows.get("evt_observe")!.processingStatus, "processing")
    ledger.finishError = false
    ledger.rows.get("evt_observe")!.processingLeaseUntil = new Date(0)
    assert.equal((await POST(request("evt_observe", "customer.subscription.trial_will_end"))).status, 200)
    assert.deepEqual(writes, [])
  })
  test("receipt persistence failure is sanitized 503, never an uncaught error", async () => {
    ledger.createError = "P1001"
    await unavailable(await POST(request()))
    assert.equal(ledger.rows.size, 0); assert.equal(reads, 0); assert.deepEqual(ledger.finishes, [])
  })
  test("provider configuration failure is sanitized before persistence", async () => {
    failInitialize = true
    await unavailable(await POST(request()))
    assert.deepEqual(ledger.creates, []); assert.equal(reads, 0)
  })
  test("request body read failure is sanitized before persistence", async () => {
    const req = request()
    req.text = async () => { throw new Error("private body failure") }
    await unavailable(await POST(req))
    assert.deepEqual(ledger.creates, []); assert.equal(reads, 0)
  })
  for (const malformed of [null, 7, { metadata: { userId: 123 } }, { metadata: "invalid" }]) {
    test(`malformed handled object ${JSON.stringify(malformed)} fails inside its claim`, async () => {
      await unavailable(await POST(request("evt_bad", "customer.subscription.updated", malformed)))
      assert.equal(ledger.rows.get("evt_bad")!.processingStatus, "failed")
      assert.equal(reads, 0); assert.deepEqual(writes, [])
    })
  }
  test("unknown type with malformed customer/metadata still claims then skips safely", async () => {
    assert.equal((await POST(request("evt_unknown", "future.event", { customer: 42, metadata: { userId: {} } }))).status, 200)
    assert.equal(ledger.rows.get("evt_unknown")!.processingStatus, "skipped")
    assert.equal(ledger.finishes[0].data.processingNote, "unhandled_event_type")
    assert.equal(reads, 0)
    assert.deepEqual(await (await POST(request("evt_unknown", "future.event", null))).json(), { received: true, deduped: true })
  })
  test("invalid signature rejects before any persistence, claim or provider call", async () => {
    const response = await POST(new Request("http://localhost/api/webhooks/stripe-billing", { method: "POST", body: "{}" }))
    assert.equal(response.status, 400)
    assert.deepEqual(ledger.creates, []); assert.deepEqual(ledger.claims, []); assert.deepEqual(ledger.finishes, [])
    assert.equal(reads, 0); assert.deepEqual(writes, [])
  })
  test("exported commit fence rejects stale tokens and never invokes a write callback", async () => {
    ledger.seed("evt_1", "processing", { processingToken: "current", processingLeaseUntil: new Date("2100-01-01") })
    let called = false
    await assert.rejects(api.withWebhookClaimCommit({ stripeEventId: "evt_1", token: "stale" }, async () => { called = true }), api.WebhookClaimLostError)
    assert.equal(called, false)
    for (const status of ["processed", "skipped", "failed"] as const) {
      await assert.rejects(api.finishWebhookEvent({ stripeEventId: "evt_1", token: "stale" }, status), api.WebhookClaimLostError)
    }
    assert.equal(ledger.rows.get("evt_1")!.processingStatus, "processing")
    assert.equal(ledger.rows.get("evt_1")!.processingToken, "current")
  })
  test("expired original token cannot commit or finish even without a replacement", async () => {
    ledger.seed("evt_1", "processing", { processingToken: "expired", processingLeaseUntil: new Date(0) })
    let called = false
    const claim = { stripeEventId: "evt_1", token: "expired" }
    await assert.rejects(api.withWebhookClaimCommit(claim, async () => { called = true }), api.WebhookClaimLostError)
    for (const status of ["processed", "skipped", "failed"] as const) {
      await assert.rejects(api.finishWebhookEvent(claim, status), api.WebhookClaimLostError)
    }
    assert.equal(called, false)
    assert.equal(ledger.rows.get("evt_1")!.processingStatus, "processing")
  })
})