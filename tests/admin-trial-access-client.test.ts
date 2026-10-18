import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createTrialAccessClient, pollTrialAccessStatus, remainingTrialAccess, trialClientError, validateTrialForm, TRIAL_STATUS_POLL_LIMIT } from "@/lib/admin/trialAccessClient"
import { freezeTrialExpiry, type TrialAccessPreviewInput } from "@/lib/billing/trialAccessInput"
import { trialClientSnapshot, trialClientForm, trialClientPreview, trialOperationId, trialTenantId } from "@/tests/helpers/trial-access-client-fixtures"

const now = new Date("2026-10-17T00:00:00Z")
test("client accepts safe internal-owner source without adding it to operation or expiry sources", async () => {
  const snapshot = trialClientSnapshot()
  snapshot.access = { ...snapshot.access, source: "platform_owner", allowAccess: true,
    effectivePlan: "small_business", effectiveAccessExpiresAt: null, effectiveTrialExpiresAt: null,
    effectiveExpirySource: null, effectiveExpiryPlan: null }
  const { client } = fixture([{ data: snapshot }])
  await client.refresh()
  assert.equal(client.state().phase, "editing")
  assert.match(remainingTrialAccess(snapshot.access), /Platform owner internal access/)
  assert.match(remainingTrialAccess(snapshot.access), /not a paid subscription or trial/)
})
function input(): TrialAccessPreviewInput {
  const parsed = validateTrialForm(trialClientForm(), trialClientSnapshot(), trialOperationId, now)
  assert.ok(parsed.input)
  return parsed.input
}
function success(notificationStatus = "not_requested") {
  const snapshot = trialClientSnapshot()
  return { operationId: trialOperationId, source: "admin_grant", action: "extend_or_grant", status: "succeeded", version: 5,
    notificationStatus, after: { ...snapshot.access, allowAccess: true, source: "admin_grant", effectivePlan: "small_business",
      effectiveAccessExpiresAt: "2026-10-24T00:00:00.000Z" } }
}
function status(value = "pending", result: unknown = null, notificationStatus = "not_requested") {
  return { operationId: trialOperationId, status: value, result, notificationStatus,
    reconciliationRequired: ["pending", "reconciliation_required"].includes(value), canReconcile: ["pending", "reconciliation_required"].includes(value) }
}
function fixture(responses: Array<{ status?: number; data?: unknown; lost?: boolean }>, storage?: Pick<Storage, "getItem" | "setItem" | "removeItem">) {
  const calls: Array<{ path: string; method: string; body: unknown }> = []
  const client = createTrialAccessClient({ tenantId: trialTenantId, snapshot: trialClientSnapshot(), storage, changed: () => {}, refreshed: () => {},
    fetch: async (url, init) => {
      calls.push({ path: String(url), method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : null })
      const next = responses.shift()
      assert.ok(next, "No unplanned API calls, providers or DB access")
      if (next.lost) throw new Error("PRIVATE provider sub_123 secret business reason")
      return new Response(JSON.stringify(next.data ?? { error: "PRIVATE raw DB failure" }), { status: next.status ?? 200 })
    } })
  return { client, calls }
}

for (const days of ["7", "14", "30"] as const) test(`${days} elapsed days validate and extend from the latest effective source`, () => {
  const snapshot = trialClientSnapshot()
  snapshot.access.effectiveTrialExpiresAt = "2026-11-01T00:00:00Z"
  const parsed = validateTrialForm({ ...trialClientForm(), duration: days }, snapshot, trialOperationId, now)
  assert.ok(parsed.input?.action === "extend_or_grant")
  const expiry = freezeTrialExpiry(parsed.input, { now, source: "admin_grant", currentEffectiveTrialExpiry: new Date(snapshot.access.effectiveTrialExpiresAt) })
  assert.equal(+expiry, Date.parse(snapshot.access.effectiveTrialExpiresAt) + Number(days) * 86400000)
  assert.equal(parsed.input.notify, false)
})

for (const plan of ["essentials", "business_control", "small_business", "business_pro"]) test(`public grant accepts ${plan}`, () => {
  assert.ok(validateTrialForm({ ...trialClientForm(), plan }, trialClientSnapshot(), trialOperationId, now).input)
})
for (const plan of ["accountant_partner", "starter", "solo", "unknown"]) test(`grant rejects ${plan}`, () => {
  assert.ok(validateTrialForm({ ...trialClientForm(), plan }, trialClientSnapshot(), trialOperationId, now).errors?.plan)
})
test("trimmed reason requires 1–1000 characters and timezone is named", () => {
  for (const reason of [" ", "x".repeat(1001)]) assert.ok(validateTrialForm({ ...trialClientForm(), reason }, trialClientSnapshot(), trialOperationId, now).errors?.reason)
  assert.ok(validateTrialForm({ ...trialClientForm(), reason: " x " }, trialClientSnapshot(), trialOperationId, now).input)
  assert.ok(validateTrialForm({ ...trialClientForm(), timeZone: "+11:00" }, trialClientSnapshot(), trialOperationId, now).errors?.timeZone)
})
test("explicit offset, DST gap/overlap, future, non-shortening and horizon validation use pure helpers", () => {
  const snapshot = trialClientSnapshot()
  const check = (expiresAt: string, timeZone = "Australia/Melbourne") => validateTrialForm({ ...trialClientForm(), duration: "explicit", expiresAt, timeZone }, snapshot, trialOperationId, now)
  assert.ok(check("2026-11-20T17:00:00+11:00").input)
  assert.ok(check("2026-11-20T06:00:00Z").input)
  assert.ok(check("2026-11-20T17:00:00").errors?.expiresAt)
  assert.ok(check("2027-10-03T02:30:00+10:00").errors?.expiresAt, "DST gap")
  assert.ok(check("2027-04-04T02:30:00+11:00").input, "first overlap offset")
  assert.ok(check("2027-04-04T02:30:00+10:00").input, "second overlap offset")
  assert.ok(check("2026-11-20T17:00:00+10:00").errors?.expiresAt)
  assert.ok(check("2026-10-01T00:00:00Z").errors?.expiresAt)
  assert.ok(check("2029-11-20T17:00:00+11:00").errors?.expiresAt)
  snapshot.access.effectiveTrialExpiresAt = "2026-12-01T00:00:00Z"
  assert.ok(check("2026-11-20T17:00:00+11:00").errors?.expiresAt)
})
test("Stripe source comes from server snapshot, not plan or client source input", () => {
  const snapshot = trialClientSnapshot(); snapshot.eligibility.source = "stripe_trial"
  const parsed = validateTrialForm(trialClientForm(), snapshot, trialOperationId, now)
  assert.ok(parsed.input); assert.ok(!("plan" in parsed.input)); assert.ok(!("source" in parsed.input))
})
test("paid and delinquent block grants while revocation remains independently allowed", () => {
  for (const billing of ["active", "past_due", "unpaid", "incomplete"]) {
    const snapshot = trialClientSnapshot(); snapshot.billing.status = billing
    snapshot.eligibility.allowedActions = { extendOrGrant: false, revokeGrant: true }
    assert.ok(validateTrialForm(trialClientForm(), snapshot, trialOperationId, now).errors?.action)
    const revoke = validateTrialForm({ ...trialClientForm(), action: "revoke_grant" }, snapshot, trialOperationId, now)
    assert.ok(revoke.input); assert.ok(!("days" in revoke.input)); assert.ok(!("plan" in revoke.input))
  }
})
test("confirmation sends only the saved UUID/version and never recalculates days", async () => {
  const { client, calls } = fixture([{ data: trialClientPreview() }, { data: success() }])
  await client.preview(input()); await client.confirm(); await client.confirm()
  assert.deepEqual(calls.map((call) => call.method), ["POST", "POST"])
  assert.deepEqual(calls[1].body, { operationId: trialOperationId, expectedVersion: 4 })
  assert.equal(client.state().phase, "complete")
})
test("lost preview retains exact input/UUID and only explicit retrieval repeats that preview", async () => {
  const { client, calls } = fixture([{ lost: true }, { data: status("previewed") }, { data: trialClientPreview() }])
  await client.preview(input()); await client.check()
  assert.equal(client.state().phase, "preview_unknown")
  await client.retryPreview()
  assert.deepEqual(calls[0].body, calls[2].body)
  assert.equal(client.state().operationId, trialOperationId)
  assert.equal(client.state().preview?.target?.expiresAt, "2026-10-24T00:00:00.000Z")
})
test("lost confirmation resolves by GET without another extension POST", async () => {
  const { client, calls } = fixture([{ data: trialClientPreview() }, { lost: true }, { data: status("succeeded", success()) }])
  await client.preview(input()); await client.confirm(); await client.check()
  assert.equal(client.state().phase, "complete"); assert.equal(calls.length, 3); assert.equal(calls[2].method, "GET")
  assert.doesNotMatch(client.state().message, /PRIVATE|sub_123|secret business reason/)
})
test("lost confirmation still previewed permits explicit same-operation confirm, never add-days replay", async () => {
  const { client, calls } = fixture([{ data: trialClientPreview() }, { lost: true }, { data: status("previewed") }, { data: success() }])
  await client.preview(input()); await client.confirm(); await client.check(); await client.confirm()
  assert.deepEqual(calls[1].body, calls[3].body)
})
test("202 polling is bounded and GET-only; recovery is one explicit frozen operation", async () => {
  const { client, calls } = fixture([{ data: trialClientPreview() }, { status: 202 },
    ...Array.from({ length: TRIAL_STATUS_POLL_LIMIT }, () => ({ status: 202, data: status() })), { data: success() }])
  await client.preview(input()); await client.confirm()
  await pollTrialAccessStatus(client, new AbortController().signal, async () => {})
  assert.equal(calls.filter((call) => call.method === "GET").length, 4)
  assert.equal(calls.filter((call) => call.method === "POST").length, 2)
  await client.reconcile()
  assert.ok(calls.at(-1)?.path.endsWith(`/operations/${trialOperationId}/reconcile`))
  assert.deepEqual(calls.at(-1)?.body, {})
})
test("stale 409 requires explicit snapshot refresh/discard and a new preview", async () => {
  const snapshot = trialClientSnapshot(); snapshot.version = 9
  const { client, calls } = fixture([{ data: trialClientPreview() }, { status: 409 }, { data: snapshot }])
  await client.preview(input()); await client.confirm()
  assert.equal(client.state().phase, "stale"); assert.equal(client.state().canConfirm, false)
  await client.confirm(); assert.equal(calls.length, 2)
  await client.refresh(); assert.equal(client.state().phase, "editing"); assert.equal(client.state().operationId, null)
  assert.equal(client.state().snapshot?.version, 9); assert.equal(calls[2].method, "GET")
})
test("unresolved operation cannot be discarded through refresh", async () => {
  const { client, calls } = fixture([{ data: trialClientPreview() }, { lost: true }])
  await client.preview(input()); await client.confirm(); await client.refresh(); await client.preview(input())
  assert.equal(calls.length, 2); assert.equal(client.state().operationId, trialOperationId)
})
test("delivery retry is separate and cannot mutate expiry or lose successful access", async () => {
  const { client, calls } = fixture([{ data: trialClientPreview() }, { data: success("failed") }, { data: { notification: { status: "sent" } } }])
  await client.preview(input()); await client.confirm()
  const result = client.state().result
  await client.retryNotification()
  assert.equal(client.state().result, result); assert.equal(client.state().delivery, "sent")
  assert.ok(calls[2].path.endsWith("/notification/retry")); assert.deepEqual(calls[2].body, {})
})
test("delivery authorization/conflict never discards access or starts a new operation", async () => {
  const { client, calls } = fixture([{ data: trialClientPreview() }, { data: success("unknown") }, { status: 403 }])
  await client.preview(input()); await client.confirm(); await client.retryNotification()
  assert.equal(client.state().result?.status, "succeeded"); assert.equal(client.state().phase, "complete")
  assert.match(client.state().message, /original elevated session/); assert.equal(calls.length, 3)
})
test("UUID-only retention survives reload for same-actor fresh-elevation status/recovery", async () => {
  const values = new Map<string, string>()
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => { values.delete(key) } }
  const original = fixture([{ lost: true }], storage)
  await original.client.preview(input())
  assert.deepEqual([...values.values()], [trialOperationId])
  assert.doesNotMatch(JSON.stringify([...values]), /reason|Evaluation|billing@example|sessionId/)
  const restored = fixture([{ status: 202, data: status() }, { data: success() }], storage)
  assert.equal(restored.client.state().operationId, trialOperationId)
  await restored.client.check(); await restored.client.reconcile()
  assert.deepEqual(restored.calls.map((call) => call.method), ["GET", "POST"])
  assert.deepEqual(restored.calls[1].body, {})
})
test("reload of unconfirmed preview requires discard/new preview, never fresh-session confirmation", async () => {
  const { client, calls } = fixture([{ data: status("previewed") }], { getItem: () => trialOperationId, setItem: () => {}, removeItem: () => {} })
  await client.check(); await client.confirm()
  assert.equal(client.state().phase, "stale"); assert.equal(calls.length, 1)
})
test("lost preview retries a cloned original intent even if the caller changes its form object", async () => {
  const { client, calls } = fixture([{ lost: true }, { data: trialClientPreview() }])
  const original = input()
  await client.preview(original)
  original.reason = "Changed after the lost response"
  original.notify = true
  await client.retryPreview()
  assert.deepEqual(calls[0].body, calls[1].body)
  assert.equal(client.state().operationId, trialOperationId)
})
test("scoped 404 after lost confirmation retains uncertainty and bounded polling never posts", async () => {
  const { client, calls } = fixture([{ data: trialClientPreview() }, { lost: true },
    ...Array.from({ length: TRIAL_STATUS_POLL_LIMIT }, () => ({ status: 404 }))])
  await client.preview(input()); await client.confirm()
  await pollTrialAccessStatus(client, new AbortController().signal, async () => {})
  await client.refresh(); await client.preview(input()); await client.confirm()
  assert.equal(client.state().phase, "uncertain")
  assert.equal(client.state().operationId, trialOperationId)
  assert.equal(calls.filter((call) => call.method === "POST").length, 2)
  assert.equal(calls.filter((call) => call.method === "GET").length, TRIAL_STATUS_POLL_LIMIT)
})
test("aborting pending polling before its next read sends no request", async () => {
  const { client, calls } = fixture([{ data: trialClientPreview() }, { status: 202 }])
  await client.preview(input()); await client.confirm()
  const abort = new AbortController()
  await pollTrialAccessStatus(client, abort.signal, async () => { abort.abort() })
  assert.equal(calls.length, 2)
  assert.equal(client.state().phase, "pending")
})
test("lost notification response preserves completed access and GET reads the later delivery outcome", async () => {
  const { client, calls } = fixture([{ data: trialClientPreview() }, { data: success("failed") },
    { lost: true }, { data: status("succeeded", success("failed"), "sent") }])
  await client.preview(input()); await client.confirm()
  const after = client.state().result?.after
  await client.retryNotification()
  assert.equal(client.state().phase, "complete")
  assert.equal(client.state().result?.after, after)
  assert.match(client.state().message, /Delivery response was lost/)
  await client.check()
  assert.equal(client.state().delivery, "sent")
  assert.deepEqual(client.state().result?.after, after)
  assert.deepEqual(calls.map((call) => call.method), ["POST", "POST", "POST", "GET"])
  assert.ok(calls[2].path.endsWith("/notification/retry"))
})
test("malformed successful preview cannot enable confirmation or a replacement operation", async () => {
  const { client, calls } = fixture([{ data: { ...trialClientPreview(), operationId: "invalid" } }])
  await client.preview(input()); await client.confirm(); await client.refresh(); await client.preview(input())
  assert.equal(client.state().phase, "preview_unknown")
  assert.equal(client.state().canConfirm, false)
  assert.equal(client.state().operationId, trialOperationId)
  assert.equal(calls.length, 1)
})
for (const code of [400, 401, 403, 404, 409, 502, 503]) test(`safe handling for HTTP ${code} never renders raw error data`, async () => {
  const { client } = fixture([{ status: code, data: { error: "PRIVATE raw reason customer_sub_secret" } }])
  await client.preview(input())
  assert.doesNotMatch(client.state().message, /PRIVATE|customer_sub_secret|raw reason/)
  assert.ok(trialClientError(code).length)
})
test("independent paid, grace, Stripe and onboarding revocation copy never claims all access ends", () => {
  for (const source of ["paid", "past_due_grace", "stripe_trial", "onboarding_trial"] as const) {
    assert.match(remainingTrialAccess({ ...trialClientSnapshot().access, allowAccess: true, source }), /Independent/)
  }
})
test("actual page mounts client management only inside its server owner guard and no full profile props", () => {
  const page = readFileSync(new URL("../app/admin/(protected)/tenants/[userId]/page.tsx", import.meta.url), "utf8")
  assert.match(page, /canManageTrialAccess && \(\s*<TrialAccessManager key=\{userId\} tenantId=\{userId\} initialSnapshot=\{management \?\? null\}/)
  const client = readFileSync(new URL("../components/admin/tenant-detail/TrialAccessManager.tsx", import.meta.url), "utf8")
  assert.doesNotMatch(client, /prismaAdmin|withUserContext|supabase\/server/)
})