import { before, describe, mock, test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import type { Resend } from "resend"
import { PLAN_CATALOG } from "@/lib/subscriptionPlans"
import type { LocalTrialOperationResult } from "@/lib/billing/trialAccessOperations"
import type { StripeTrialExtensionResult } from "@/lib/billing/stripeTrialExtension"
import type { SafeTrialPreviewSnapshot } from "@/lib/billing/trialAccessPreview"
import type { TrialAccessContact } from "@/lib/email/trialAccessContact"
import type { CompletedTrialNotificationResult, TrialAccessNotificationPayload } from "@/lib/email/trialAccessNotification"

let templates: typeof import("@/lib/email/trialAccessNotification")
let sending: typeof import("@/lib/email/sendTrialAccessNotification")
before(async () => {
  mock.module("server-only", { namedExports: {} })
  templates = await import("@/lib/email/trialAccessNotification")
  sending = await import("@/lib/email/sendTrialAccessNotification")
})
const operationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const key = `trial-access/${operationId}`
const end = "2026-11-01T01:30:00.000Z"
const env = { NODE_ENV: "test" as const, NEXT_PUBLIC_APP_URL: "https://app.paidsoon.com.au", RESEND_FROM_EMAIL: "system@paidsoon.com.au", RESEND_FROM_NAME: "PaidSoon" }
// Non-reserved address is sent ONLY to the injected fake SDK below.
const contact: TrialAccessContact = { email: "billing@customer.com.au", name: "Billing Team", source: "stripe_billing", nameMissing: false }
function after(overrides: Partial<SafeTrialPreviewSnapshot> = {}): SafeTrialPreviewSnapshot {
  return { allowAccess: true, effectivePlan: "business_control", source: "admin_grant", effectiveAccessExpiresAt: end,
    effectiveTrialExpiresAt: end, effectiveExpirySource: "admin_grant", effectiveExpiryPlan: "business_control",
    stripeTrialEndsAt: null, billingPlan: "essentials", billingStatus: "canceled", grant: null,
    restriction: null, trialTimingPendingReconciliation: false, ...overrides }
}
function grant(overrides: Partial<LocalTrialOperationResult> = {}): LocalTrialOperationResult {
  return { operationId, action: "extend_or_grant", source: "admin_grant", status: "succeeded", targetPlan: "business_control",
    targetExpiresAt: end, version: 2, notificationStatus: "pending", after: after(), ...overrides }
}
function stripe(): StripeTrialExtensionResult {
  return { ...grant(), action: "extend_or_grant", source: "stripe_trial", targetPlan: "small_business", targetExpiresAt: end,
    after: after({ source: "stripe_trial", effectivePlan: "small_business", stripeTrialEndsAt: end }) }
}
function build(result: CompletedTrialNotificationResult = grant(), recipient = contact, config: NodeJS.ProcessEnv = env) {
  return templates.buildTrialAccessNotification(result, recipient, config)
}
function revoke(snapshot: Partial<SafeTrialPreviewSnapshot>) {
  return build(grant({ action: "revoke_grant", targetPlan: null, targetExpiresAt: null, after: after(snapshot) }))
}
function invalidResult(value: unknown): CompletedTrialNotificationResult { return value as CompletedTrialNotificationResult }

describe("trial access notification templates", () => {
  test("revocation preserves owner internal access without a paid or trial claim", () => {
    const payload = revoke({ source: "platform_owner", effectiveAccessExpiresAt: null,
      effectiveTrialExpiresAt: null, effectiveExpirySource: null, effectiveExpiryPlan: null })
    assert.match(payload.text, /Platform owner internal access remains available/)
    assert.match(payload.text, /not a paid subscription or a trial/)
    assert.doesNotMatch(payload.text, /2026-11-01|until null|No independent access|independent paid/)
  })
  test("Stripe extension identifies its catalog plan, precise UTC end and first billing change", () => {
    const payload = build(stripe())
    for (const body of [payload.text, payload.html]) {
      assert.match(body, /Small Business Stripe trial has been extended/)
      assert.match(body, /2026-11-01 01:30:00 UTC \(exclusive\)/)
      assert.match(body, /changes the timing of first billing/)
      assert.match(body, /not a waiver of future charges/)
        assert.match(body, /https:\/\/app\.paidsoon\.com\.au\/settings\/subscription/)
      assert.doesNotMatch(body, /Stripe billing unchanged/)
    }
    assert.equal(payload.subject, "Your PaidSoon Stripe trial has been extended")
  })

  test("application grants use all four public catalog labels and do not promise postponed charges", () => {
    for (const plan of ["essentials", "business_control", "small_business", "business_pro"] as const) {
      const payload = build(grant({ targetPlan: plan }))
      for (const body of [payload.html, payload.text]) {
        assert.ok(body.includes(PLAN_CATALOG[plan].name))
        assert.match(body, /PaidSoon access only — Stripe billing unchanged/)
        assert.match(body, /does not create or restart a Stripe subscription/)
        assert.match(body, /or postpone or change existing Stripe charges/)
        assert.match(body, /2026-11-01 01:30:00 UTC \(exclusive\)/)
        assert.doesNotMatch(body, /first billing/)
      }
    }
  })

  test("revocation of sole access stops gated features, not access to billing resolution", () => {
    const payload = revoke({ allowAccess: false, source: "none", effectivePlan: null, effectiveAccessExpiresAt: null })
    for (const body of [payload.html, payload.text]) {
      assert.match(body, /only that grant; Stripe billing is unchanged/)
      assert.match(body, /No independent access currently remains/)
      assert.match(body, /still open subscription settings/)
      assert.doesNotMatch(body, /Business Control|until null|undefined/)
    }
  })

  test("revocation preserves paid access without presenting billing period or grant expiry as a cutoff", () => {
    const payload = revoke({ source: "paid", effectivePlan: "business_pro", effectiveAccessExpiresAt: null })
    assert.match(payload.text, /independent paid Business Pro subscription access remains unchanged/)
    assert.match(payload.text, /does not cancel your subscription or change its charges/)
    assert.doesNotMatch(payload.text, /2026-11-01|until|No independent access/)
  })

  test("revocation reports the independent Stripe end, not a removed longer grant", () => {
    const payload = revoke({ source: "stripe_trial", stripeTrialEndsAt: "2026-10-25T12:15:30.000Z" })
    assert.match(payload.text, /independent Business Control Stripe trial remains unchanged/)
    assert.match(payload.text, /2026-10-25 12:15:30 UTC \(exclusive\)/)
    assert.doesNotMatch(payload.text, /2026-11-01|first billing|No independent access/)
  })

  test("revocation does not invent an end for a Stripe trial pending timing reconciliation", () => {
    const payload = revoke({ source: "stripe_trial", stripeTrialEndsAt: "2026-10-01T00:00:00.000Z", trialTimingPendingReconciliation: true })
    assert.match(payload.text, /end timing is pending reconciliation/)
    assert.doesNotMatch(payload.text, /2026-10-01|2026-11-01|No independent access/)
  })

  test("revocation preserves bounded onboarding access and billing-restricted grace accurately", () => {
    const onboarding = revoke({ source: "onboarding_trial" })
    assert.match(onboarding.text, /onboarding trial access remains available until 2026-11-01 01:30:00 UTC/)
    const grace = revoke({ source: "past_due_grace", effectiveAccessExpiresAt: null })
    assert.match(grace.text, /billing grace access remains unchanged, subject to billing resolution/)
    assert.match(grace.text, /does not settle outstanding billing/)
    assert.doesNotMatch(grace.text, /2026-11-01|No independent access/)
  })

  test("names are escaped as literal text, controls removed and internal fields never interpolated", () => {
    const result = { ...grant(), reason: "INTERNAL_REASON", stripeCustomerId: "cus_PRIVATE", stripeRequestId: "req_PRIVATE",
      providerIdempotencyKey: "KEY_PRIVATE", arbitraryHtml: '<a href="https://evil.com">evil</a>' }
    const payload = build(result, { ...contact, name: '\r\n<img src=x onerror="alert(1)"> & <script>evil()</script>\u0000\u202e' })
    assert.match(payload.html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt; &amp; &lt;script&gt;/)
    assert.doesNotMatch(payload.html, /<img|<script|href="https:\/\/evil/)
    assert.doesNotMatch(payload.text, /[\r\u0000\u202e]/u)
    for (const value of Object.values(payload)) {
      assert.doesNotMatch(value, /INTERNAL_REASON|cus_PRIVATE|req_PRIVATE|KEY_PRIVATE|arbitraryHtml/)
      assert.ok(!value.includes(operationId))
      assert.ok(!value.includes(key))
    }
    assert.equal(payload.subject, "Your temporary PaidSoon application access")
  })

  test("missing names and owner fallback use a safe greeting without exposing contact provenance", () => {
    const payload = build(grant(), { ...contact, name: null, source: "owner_fallback", nameMissing: true })
    assert.match(payload.text, /^Hi there,/)
    assert.doesNotMatch(payload.text, /owner_fallback|stripe_billing/)
  })

  test("configuration uses system sender and canonical app setting; payload stays immutable across later changes", () => {
    const config = { ...env, RESEND_FROM_NAME: 'PaidSoon\r\n<injected>', VERCEL_URL: "other.vercel.app", fromEmail: "custom@evil.com" }
    const result = grant()
    const person = { ...contact }
    const payload = build(result, person, config)
    assert.equal(payload.from, "PaidSoon  injected <system@paidsoon.com.au>")
    const original = JSON.stringify(payload)
    config.RESEND_FROM_EMAIL = "changed@paidsoon.com.au"; config.NEXT_PUBLIC_APP_URL = "https://other.com"
    result.targetExpiresAt = "2027-01-01T00:00:00Z"; person.email = "changed@customer.com.au"
    assert.ok(Object.isFrozen(payload))
    assert.equal(JSON.stringify(payload), original)
    assert.match(payload.html, /href="https:\/\/app.paidsoon.com.au\/settings\/subscription"/)
    assert.doesNotMatch(payload.html, /other.vercel.app|custom@evil.com/)
  })

  test("VERCEL_URL hostname fallback and explicit local HTTP yield absolute fixed-path links", () => {
    assert.match(build(grant(), contact, { ...env, NEXT_PUBLIC_APP_URL: undefined, VERCEL_URL: "preview.vercel.app" }).text,
      /https:\/\/preview.vercel.app\/settings\/subscription/)
    assert.match(build(grant(), contact, { ...env, NEXT_PUBLIC_APP_URL: "http://localhost:4001/" }).text,
      /http:\/\/localhost:4001\/settings\/subscription/)
  })

  test("unsafe or missing app URLs fail closed rather than produce injected or relative links", () => {
    for (const url of [undefined, "", "javascript:alert(1)", "//evil.com", "https://user:secret@app.com", "http://evil.com",
      'https://app.com/\" onclick=\"evil', "https://app.com/?next=https://evil.com", "https://app.com/#evil", "https://app.com/custom",
      "https://app.com\\@evil.com", "https://app.com\n.evil.com"]) {
      assert.throws(() => build(grant(), contact, { ...env, NEXT_PUBLIC_APP_URL: url }), /^Error: trial_notification_invalid_input$/)
    }
  })

  test("missing/unverified contacts and header injection fail without PII in errors", () => {
    for (const recipient of [{ ...contact, email: null }, { ...contact, source: null },
      { ...contact, email: "billing@customer.com.au\r\nBcc: victim@customer.com.au" }]) {
      assert.throws(() => build(grant(), recipient), /^Error: trial_notification_invalid_input$/)
    }
    assert.throws(() => build(grant(), contact, { ...env, RESEND_FROM_EMAIL: "system@paidsoon.com.au\r\nBcc: evil" }),
      /^Error: trial_notification_invalid_input$/)
  })

  test("noncompleted results, arbitrary plans/dates and contradictory revocation sources are rejected", () => {
    for (const result of [
      { ...grant(), status: "pending" }, { ...grant(), status: "superseded" }, { ...grant(), status: "failed" },
      { ...grant(), targetPlan: '<img src=x onerror="evil">' }, { ...grant(), targetPlan: "starter" },
      { ...grant(), targetPlan: "accountant_partner" }, { ...grant(), targetExpiresAt: "not-a-date" },
      { ...grant(), targetExpiresAt: "2026-11-01T01:30:00.001Z" }, { ...grant(), targetExpiresAt: "2026-11-01T01:30:00" },
      { ...stripe(), action: "revoke_grant" },
      grant({ action: "revoke_grant", after: after({ source: "admin_grant" }) }),
      grant({ action: "revoke_grant", after: after({ source: "onboarding_trial", effectiveAccessExpiresAt: null }) }),
    ]) assert.throws(() => build(invalidResult(result)), /^Error: trial_notification_invalid_input$/)
  })
})

type Response = Awaited<ReturnType<Resend["emails"]["send"]>>
function fakeSender(response: unknown = { data: { id: "message-123" }, error: null }, thrown?: unknown) {
  const calls: unknown[][] = []
  let constructions = 0
  const send: Resend["emails"]["send"] = async (...args) => {
    calls.push(args)
    if (thrown !== undefined) throw thrown
    return response as Response
  }
  const sender = sending.createTrialAccessNotificationSender({ transport: () => { constructions++; return { send } } })
  return { sender, calls, constructions: () => constructions }
}
describe("trial access Resend transport (mocked only)", () => {
  test("sends exactly the frozen system payload and caller-provided key once, requiring a message ID", async () => {
    const payload = build()
    const fake = fakeSender()
    assert.deepEqual(await fake.sender.send(payload, key), { status: "sent", messageId: "message-123" })
    assert.deepEqual(fake.calls, [[payload, { idempotencyKey: key }]])
    assert.equal(fake.constructions(), 1)
    assert.deepEqual(Object.keys(payload).sort(), ["from", "html", "subject", "text", "to"])
  })

  test("SDK error-valued and thrown explicit validation rejections are known unsent", async () => {
    for (const [name, statusCode] of [["validation_error", 422], ["invalid_api_key", 403], ["rate_limit_exceeded", 429]] as const) {
      const error = { name, statusCode, message: `PRIVATE ${contact.email} ${key}` }
      for (const fake of [fakeSender({ data: null, error }), fakeSender(null, error)]) {
        assert.deepEqual(await fake.sender.send(build(), key), { status: "not_sent", code: "provider_rejected" })
        assert.equal(fake.calls.length, 1)
      }
    }
  })

  test("timeouts, network/SDK fetch failures, 5xx and idempotency conflicts stay unknown, never auto-retried", async () => {
    for (const error of [new Error(`timeout ${contact.email} ${key}`), { name: "application_error", statusCode: null },
      { name: "internal_server_error", statusCode: 500 }, { name: "validation_error", statusCode: 500 },
      { name: "invalid_idempotent_request", statusCode: 409 }, { name: "concurrent_idempotent_requests", statusCode: 409 },
      { name: "new_provider_code", statusCode: 400 }, { statusCode: 400 }, null]) {
      const fake = error === null ? fakeSender(null, "opaque thrown error") : fakeSender({ data: null, error })
      assert.deepEqual(await fake.sender.send(build(), key), { status: "unknown", code: "provider_uncertain" })
      assert.equal(fake.calls.length, 1)
    }
    const thrown = fakeSender(null, new Error("network failure"))
    assert.deepEqual(await thrown.sender.send(build(), key), { status: "unknown", code: "provider_uncertain" })
  })

  test("missing, malformed, blank or conflicting success responses never become sent or known-unsent", async () => {
    for (const response of [null, undefined, {}, { data: null, error: null }, { data: {}, error: null },
      ...["", " ", " id ", "id\r\nheader", 12].map((id) => ({ data: { id }, error: null })),
      { data: { id: "id" } }, { data: { id: "id" }, error: { name: "application_error", statusCode: 500 } }]) {
      const fake = fakeSender(response === undefined ? {} : response)
      const result = await fake.sender.send(build(), key)
      assert.equal(result.status, "unknown")
      assert.equal(fake.calls.length, 1)
    }
    const contradictory = fakeSender({ data: { id: "id" }, error: { name: "validation_error", statusCode: 422 } })
    assert.deepEqual(await contradictory.sender.send(build(), key), { status: "unknown", code: "invalid_response" })
  })

  test("invalid keys/payloads and reserved recipients are known unsent before client construction", async () => {
    const fake = fakeSender()
    for (const badKey of ["", operationId, "trial-access/arbitrary", `${key}\r\nheader`]) {
      assert.deepEqual(await fake.sender.send(build(), badKey), { status: "not_sent", code: "invalid_key" })
    }
    for (const payload of [{ ...build(), to: "bad\r\naddress" }, { ...build(), subject: "bad\r\nheader" },
      { ...build(), from: "bad\nheader" }, { ...build(), replyTo: "custom@evil.com" }]) {
      assert.deepEqual(await fake.sender.send(payload, key), { status: "not_sent", code: "invalid_payload" })
    }
    for (const email of ["seed@example.test", "seed@example.com", "seed@demo.invalid"]) {
      assert.deepEqual(await fake.sender.send(build(grant(), { ...contact, email }), key), { status: "not_sent", code: "reserved_recipient" })
    }
    assert.equal(fake.constructions(), 0)
    assert.equal(fake.calls.length, 0)
  })

  test("construction failure is known-unsent and missing API config never instantiates the real SDK", async () => {
    const sender = sending.createTrialAccessNotificationSender({ transport: () => { throw new Error(`private ${contact.email}`) } })
    assert.deepEqual(await sender.send(build(), key), { status: "not_sent", code: "missing_configuration" })
    const original = process.env.RESEND_API_KEY
    try {
      delete process.env.RESEND_API_KEY
      assert.deepEqual(await sending.createTrialAccessNotificationSender().send(build(), key), { status: "not_sent", code: "missing_configuration" })
    } finally {
      if (original === undefined) delete process.env.RESEND_API_KEY
      else process.env.RESEND_API_KEY = original
    }
  })

  test("payload is copied before async dispatch and safe outcomes contain no PII, keys or provider errors", async () => {
    let resolve!: (response: Response) => void
    const calls: TrialAccessNotificationPayload[] = []
    const sender = sending.createTrialAccessNotificationSender({ transport: () => ({ send: async (payload) => {
      calls.push(payload as TrialAccessNotificationPayload)
      return new Promise<Response>((done) => { resolve = done })
    } }) })
    const payload = { ...build() }
    const original = { ...payload }
    const pending = sender.send(payload, key)
    payload.to = "changed@customer.com.au"; payload.html = "changed"
    resolve({ data: null, error: { name: "validation_error", statusCode: 422, message: `${contact.email} ${key}` }, headers: null })
    const outcome = await pending
    assert.deepEqual(calls, [original])
    assert.deepEqual(outcome, { status: "not_sent", code: "provider_rejected" })
    assert.doesNotMatch(JSON.stringify(outcome), /customer\.com|trial-access\//)
  })

  test("isolated email services contain no routes, database/log writes, PII logging or delivery claims", () => {
    for (const file of ["trialAccessNotification.ts", "sendTrialAccessNotification.ts"]) {
      const source = readFileSync(new URL(`../lib/email/${file}`, import.meta.url), "utf8")
      assert.doesNotMatch(source, /console\.|prismaAdmin|withUserContext|\.emailLog\.|tenantTrialNotification\.|requireAdminElevation/)
    }
  })
})