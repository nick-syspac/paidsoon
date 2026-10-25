import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { billingClientScope } from "@/lib/billing/billingClientScope"
import {
  BILLING_POLL_ATTEMPTS, BILLING_STORAGE_KEY, billingResultNavigation, billingSafetyHeaders, createBillingClientOperation,
  pollBillingOperation, type BillingRequest, type BillingResult,
} from "@/lib/billing/clientOperation"

const id = "96ea5264-fbe7-4d46-9086-e9244675c511"
const otherId = "96ea5264-fbe7-4d46-9086-e9244675c512"
const checkout: BillingRequest = { path: "/api/billing/checkout", method: "POST", body: { tier: "small_business" } }
const portal: BillingRequest = { path: "/api/billing/portal", method: "POST", body: null }
const pending = { operationId: id, status: "reconciliation_required", canReconcile: true, result: null }
const json = (body: unknown, status = 200): Response => Response.json(body, { status })
function storage() {
  const values = new Map<string, string>()
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => { values.delete(key) } }
}
function setup(respond: (path: string, init: RequestInit) => Promise<Response> = async () => json(pending, 202), store = storage(), scope = "session-one") {
  const calls: { path: string; init: RequestInit }[] = []
  const successes: BillingResult[] = []
  let refreshes = 0
  let uuids = 0
  const controller = createBillingClientOperation({
    scope, storage: store, uuid: () => { uuids++; return uuids === 1 ? id : otherId },
    fetch: async (path, init) => { calls.push({ path: String(path), init: init ?? {} }); return respond(String(path), init ?? {}) },
    changed: () => {}, refresh: () => { refreshes++ }, success: (result) => { successes.push(result) },
  })
  return { controller, calls, successes, store, refreshes: () => refreshes, uuids: () => uuids }
}

for (const request of [checkout, portal, { path: "/api/billing/cancel", method: "POST", body: null }, { path: "/api/billing/downgrade", method: "POST", body: { tier: "essentials" } }, { path: "/api/billing/downgrade", method: "DELETE", body: null }] satisfies BillingRequest[]) {
  test(`sends stable UUID/version envelope for ${request.method} ${request.path} without changing body`, async () => {
    const s = setup()
    await s.controller.start(request, 7)
    const call = s.calls[0]
    assert.deepEqual(call.init.headers, { "Content-Type": "application/json", "Idempotency-Key": id, "X-Billing-Access-Version": "7" })
    assert.equal(call.init.method, request.method)
    assert.equal(call.init.body, request.body ? JSON.stringify(request.body) : undefined)
    assert.equal(call.init.credentials, "same-origin")
    assert.equal(call.init.cache, "no-store")
    assert.ok(s.store.getItem(BILLING_STORAGE_KEY)?.includes(id))
  })
}

test("rejects malformed or missing client safety values before dispatch", async () => {
  const s = setup()
  for (const version of [null, -1, 0.5, Number.MAX_SAFE_INTEGER + 1]) await s.controller.start(checkout, version)
  assert.equal(s.calls.length, 0)
  assert.throws(() => billingSafetyHeaders({ ...checkout, operationId: "not-a-uuid", version: 1 }))
  assert.throws(() => billingSafetyHeaders({ ...checkout, operationId: id, version: -1 }))
})

test("persists before dispatch and retains frozen intent/version across lost response, duplicate click and reload", async () => {
  const store = storage()
  const s = setup(async () => {
    assert.ok(store.getItem(BILLING_STORAGE_KEY)?.includes(id))
    throw new Error("response lost after acceptance")
  }, store)
  await s.controller.start(checkout, 7)
  await s.controller.start({ ...checkout, body: { tier: "business_pro" } }, 99)
  assert.equal(s.calls.filter((call) => call.init.method === "POST").length, 1)
  assert.deepEqual(s.controller.state().intent, { ...checkout, operationId: id, version: 7 })
  assert.equal(s.uuids(), 1)
  const restored = setup(async () => json(pending), store)
  await restored.controller.start(portal, 100)
  assert.equal(restored.calls[0].init.method, "GET")
  assert.equal(restored.controller.state().intent?.operationId, id)
  assert.equal(restored.controller.state().intent?.version, 7)
  assert.equal(restored.uuids(), 0)
})

test("concurrent duplicate clicks cannot dispatch a second mutation", async () => {
  let release!: (response: Response) => void
  const s = setup(() => new Promise((resolve) => { release = resolve }))
  const first = s.controller.start(checkout, 1)
  await s.controller.start(checkout, 1)
  assert.equal(s.calls.length, 1)
  release(json(pending, 202))
  await first
})

test("another mounted billing caller observes the same tab's stored unresolved intent", async () => {
  const store = storage()
  const one = setup(undefined, store)
  const two = setup(undefined, store)
  await one.controller.start(checkout, 1)
  await two.controller.start(portal, 1)
  assert.equal(two.calls[0].init.method, "GET")
  assert.equal(two.uuids(), 0)
})

test("202 with a URL is never treated as success or navigated", async () => {
  const s = setup(async () => json({ ...pending, url: "https://checkout.stripe.com/should-not-navigate" }, 202))
  await s.controller.start(checkout, 1)
  assert.equal(s.successes.length, 0)
  assert.equal(s.controller.state().phase, "pending")
  assert.match(s.controller.state().message ?? "", /does not confirm a charge/)
  assert.equal(s.controller.state().canReconcile, true)
})

test("polls only GET at bounded cadence and never reconciles automatically", async () => {
  const s = setup(async () => json(pending))
  // A 202 response starts the intent; all subsequent polling uses GET.
  const accepted = setup(undefined, s.store)
  await accepted.controller.start(checkout, 1)
  const restored = setup(async () => json(pending), s.store)
  let waits = 0
  await pollBillingOperation(restored.controller, new AbortController().signal, async () => { waits++ })
  assert.equal(restored.calls.length, BILLING_POLL_ATTEMPTS)
  assert.equal(waits, BILLING_POLL_ATTEMPTS - 1)
  assert.ok(restored.calls.every((call) => call.init.method === "GET" && call.init.body === undefined))
  assert.equal(restored.successes.length, 0)
})

test("aborting polling stops future attempts and carries signal to fetch", async () => {
  const s = setup()
  await s.controller.start(checkout, 1)
  s.calls.length = 0
  const abort = new AbortController()
  await pollBillingOperation(s.controller, abort.signal, async () => { abort.abort() })
  assert.equal(s.calls.length, 1)
  assert.ok(s.calls[0].init.signal instanceof AbortSignal)
})

test("explicit reconcile uses own UUID, same-origin credentials and strict empty body once", async () => {
  const s = setup(async () => json(pending, 202))
  await s.controller.start(checkout, 7)
  assert.equal(s.calls.length, 1)
  await s.controller.reconcile()
  const call = s.calls[1]
  assert.equal(call.path, `/api/billing/operations/${id}/reconcile`)
  assert.equal(call.init.method, "POST")
  assert.equal(call.init.body, "{}")
  assert.equal(call.init.credentials, "same-origin")
  assert.deepEqual(call.init.headers, { "Content-Type": "application/json" })
  assert.equal(s.calls.length, 2)
})

for (const status of [400, 404, 502, 503]) {
  test(`${status} and raw error messages do not cause retry, new identity, navigation or false success`, async () => {
    const s = setup(async () => json({ error: "secret provider diagnostic", url: "https://stripe.test/not-success" }, status))
    await s.controller.start(checkout, 1)
    await s.controller.start(portal, 2)
    assert.equal(s.calls.filter((call) => call.init.method === "POST").length, 1)
    assert.equal(s.uuids(), 1)
    assert.equal(s.successes.length, 0)
    assert.doesNotMatch(s.controller.state().message ?? "", /secret provider/)
  })
}

test("409 refreshes version/reservation presentation without automatic new key or provider action", async () => {
  const s = setup(async () => json({ error: "billing_version_conflict" }, 409))
  await s.controller.start(checkout, 7)
  assert.equal(s.controller.state().phase, "conflict")
  assert.equal(s.refreshes(), 1)
  await s.controller.start(checkout, 8)
  assert.equal(s.calls[1].init.method, "GET")
  assert.equal(s.controller.state().intent?.version, 7)
  assert.equal(s.uuids(), 1)
})

for (const result of [{ url: "https://checkout.stripe.com/test" }, { redirectUrl: "https://paidsoon.test/settings/subscription?cancellation=ended" }, { scheduledAt: "2026-11-01T00:00:00.000Z" }, { cancelled: true }] satisfies BillingResult[]) {
  test(`preserves successful result ${Object.keys(result)[0]} and stores no result/URL`, async () => {
    const s = setup(async () => json(result))
    await s.controller.start(checkout, 1)
    assert.deepEqual(s.successes, [result])
    assert.equal(s.controller.state().phase, "succeeded")
    const persisted = s.store.getItem(BILLING_STORAGE_KEY) ?? ""
    assert.doesNotMatch(persisted, /https:|scheduledAt|cancelled|redirectUrl|result/)
    const restored = setup(undefined, s.store)
    await pollBillingOperation(restored.controller, new AbortController().signal, async () => {})
    assert.equal(restored.calls.length, 0, "returning from hosted flow must not auto-redirect")
  })
}

test("GET terminal success forwards original result once and polling stops", async () => {
  const s = setup(async (_path, init) => init.method === "GET" ? json({ ...pending, status: "succeeded", result: { url: "https://checkout.stripe.com/original" } }) : json(pending, 202))
  await s.controller.start(checkout, 1)
  await pollBillingOperation(s.controller, new AbortController().signal, async () => {})
  assert.equal(s.successes.length, 1)
  assert.equal(s.calls.length, 2)
  await s.controller.check()
  assert.equal(s.successes.length, 1)
})

for (const status of ["failed", "superseded"]) {
  test(`terminal ${status} refreshes only, never navigates stale URL or replaces the same intent`, async () => {
    const s = setup(async (_path, init) => init.method === "GET" ? json({ ...pending, status, result: status === "superseded" ? { url: "https://stripe.test/obsolete" } : null }) : json(pending, 202))
    await s.controller.start(checkout, 1)
    await s.controller.check()
    await s.controller.start(checkout, 99)
    assert.equal(s.successes.length, 0)
    assert.ok(s.refreshes() >= 1)
    assert.equal(s.calls.filter((call) => call.init.method === "POST").length, 1)
  })
}

test("foreign/mismatched status identity cannot trigger success", async () => {
  const s = setup(async () => json({ ...pending, operationId: otherId, status: "succeeded", result: { url: "https://stripe.test/foreign" } }, 202))
  await s.controller.start(checkout, 1)
  assert.equal(s.successes.length, 0)
  assert.equal(s.controller.state().phase, "pending")
})

test("new authenticated scope removes old intent, and 401/sign-out clears and disables controller", async () => {
  const one = setup()
  await one.controller.start(checkout, 1)
  const two = setup(undefined, one.store, "another-session")
  assert.equal(two.controller.state().intent, null)
  assert.equal(one.store.getItem(BILLING_STORAGE_KEY), null)
  const unauthorized = setup(async () => json({ error: "Unauthorized" }, 401))
  await unauthorized.controller.start(checkout, 1)
  assert.equal(unauthorized.store.getItem(BILLING_STORAGE_KEY), null)
  assert.equal(unauthorized.controller.state().intent, null)
  await unauthorized.controller.start(checkout, 1)
  assert.equal(unauthorized.calls.length, 1)
  one.controller.clearSession()
  assert.equal(one.controller.state().intent, null)
})

test("unmount discards late results and aborts outstanding requests without deleting frozen intent", async () => {
  let release!: (response: Response) => void
  const s = setup(() => new Promise((resolve) => { release = resolve }))
  const request = s.controller.start(checkout, 1)
  s.controller.dispose()
  assert.equal(s.calls[0].init.signal?.aborted, true)
  release(json({ url: "https://stripe.test/late" }))
  await request
  assert.equal(s.successes.length, 0)
  assert.ok(s.store.getItem(BILLING_STORAGE_KEY)?.includes(id))
})

test("storage failure prevents mutation dispatch", async () => {
  const store = storage()
  store.setItem = () => { throw new Error("blocked") }
  const s = setup(undefined, store)
  await s.controller.start(checkout, 1)
  assert.equal(s.calls.length, 0)
  assert.match(s.controller.state().message ?? "", /storage is unavailable/)
})

test("new intent requires explicit terminal acknowledgement; unknown request cannot be discarded", async () => {
  const s = setup()
  await s.controller.start(checkout, 1)
  s.controller.beginNewIntent()
  assert.equal(s.controller.state().intent?.operationId, id)
  assert.equal(s.calls.length, 1)
  const terminal = setup(async () => json({ cancelled: true }))
  await terminal.controller.start({ path: "/api/billing/downgrade", method: "DELETE", body: null }, 1)
  terminal.controller.beginNewIntent()
  assert.equal(terminal.controller.state().intent, null)
  assert.equal(terminal.calls.length, 1)
  assert.equal(terminal.uuids(), 1)
  await terminal.controller.start(checkout, 2)
  assert.equal(terminal.calls.length, 2)
  assert.equal(terminal.controller.state().intent?.operationId, otherId)
})

test("opaque server scope changes on user/sign-in but is stable across render/version changes", () => {
  assert.equal(billingClientScope("user", id), billingClientScope("user", id))
  assert.notEqual(billingClientScope("user", id), billingClientScope("another-user", id))
  assert.notEqual(billingClientScope("user", id), billingClientScope("user", otherId))
  assert.match(billingClientScope("user", id), /^[a-f0-9]{64}$/)
})

test("result navigation preserves hosted/local redirects; scheduling and undo require refresh only", () => {
  const origin = "https://paidsoon.test"
  assert.equal(billingResultNavigation({ url: "https://checkout.stripe.com/known" }, origin), "https://checkout.stripe.com/known")
  assert.equal(billingResultNavigation({ redirectUrl: "/settings/subscription?cancellation=ended" }, origin), `${origin}/settings/subscription?cancellation=ended`)
  assert.equal(billingResultNavigation({ scheduledAt: "2026-11-01T00:00:00.000Z" }, origin), null)
  assert.equal(billingResultNavigation({ cancelled: true }, origin), null)
  assert.equal(billingResultNavigation({ url: "javascript:alert(1)" }, origin), null)
  assert.equal(billingResultNavigation({ url: "http://foreign.test/" }, origin), null)
})

test("late terminal observation/acknowledgement cannot overwrite a newer unresolved tab intent", async () => {
  const store = storage()
  const old = setup(async () => json({ cancelled: true }), store)
  await old.controller.start(checkout, 1)
  const current = setup(undefined, store)
  current.controller.beginNewIntent()
  await current.controller.start(portal, 2)
  // Use a distinct UUID because this simulated second mount's deterministic generator starts at id.
  const saved = JSON.parse(store.getItem(BILLING_STORAGE_KEY) ?? "null") as { scope: string; intent: { operationId: string } }
  saved.intent.operationId = otherId
  store.setItem(BILLING_STORAGE_KEY, JSON.stringify(saved))
  old.controller.beginNewIntent()
  assert.equal(old.controller.state().intent?.operationId, otherId)
  assert.equal(old.controller.state().phase, "pending")
  assert.ok(store.getItem(BILLING_STORAGE_KEY)?.includes(otherId))
})

test("all direct callers use shared recovery; pricing/onboarding introduce no unkeyed billing POST", () => {
  for (const file of ["components/billing/StartCheckoutButton.tsx", "components/dashboard/UpgradeBanner.tsx", "components/settings/SubscriptionClient.tsx", "components/settings/SubscriptionCancellationClient.tsx"]) {
    const source = readFileSync(file, "utf8")
    assert.match(source, /useBillingOperation/)
    assert.match(source, /BillingOperationNotice/)
    assert.doesNotMatch(source, /fetch\(/)
  }
  for (const file of ["components/pricing/PricingCTA.tsx", "components/onboarding/OnboardingPlanPicker.tsx"]) assert.doesNotMatch(readFileSync(file, "utf8"), /fetch\(["']\/api\/billing/)
  const page = readFileSync("app/billing/checkout/page.tsx", "utf8")
  assert.match(page, /billingAccessVersion: true/)
  assert.match(page, /billingSessionScope=\{await getBillingClientScope\(user.id\)\}/)
  assert.doesNotMatch(page, /requireFeature|allowAccess|stripeCustomerId|stripeSubscriptionId/)
  assert.match(readFileSync("components/billing/BillingOperationNotice.tsx", "utf8"), /role="status" aria-live="polite"/)
})