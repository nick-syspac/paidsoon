import test from "node:test"
import assert from "node:assert/strict"
import { getPublicPlans } from "@/lib/subscriptionPlans"
import {
  trialAccessPreviewSchema,
  trialAccessConfirmationSchema,
  trialAccessPlanSchema,
  trialAccessExpirySchema,
  validateTrialAccessSource,
  freezeTrialExpiry,
  validateFrozenTrialExpiry,
  formatTrialExpiryPreview,
  type TrialAccessExtensionInput,
  type TrialExpiryContext,
} from "@/lib/billing/trialAccessInput"

const operationId = "12345678-1234-4234-8234-123456789abc"
const now = new Date("2026-10-14T12:00:00Z")
const day = 86_400_000
const request = {
  operationId, action: "extend_or_grant", days: 7,
  plan: "business_control", reason: " Evaluation extension ",
  timeZone: "Australia/Melbourne", expectedVersion: 0,
}
const context: TrialExpiryContext = {
  now, currentEffectiveTrialExpiry: null, source: "admin_grant",
}

function extension(overrides: Record<string, unknown> = {}): TrialAccessExtensionInput {
  const input = trialAccessPreviewSchema.parse({ ...request, ...overrides })
  assert.equal(input.action, "extend_or_grant")
  if (input.action !== "extend_or_grant") throw new Error("Expected extension")
  return input
}

test("preview trims reason, defaults notification off and preserves explicit opt-in", () => {
  assert.equal(extension().reason, "Evaluation extension")
  assert.equal(extension().notify, false)
  assert.equal(extension({ notify: true }).notify, true)
  assert.equal(extension({ reason: " x " }).reason, "x")
  assert.equal(extension({ reason: ` ${"x".repeat(1000)} ` }).reason.length, 1000)
  for (const reason of ["", " \n\t ", "x".repeat(1001), null, 123]) {
    assert.equal(trialAccessPreviewSchema.safeParse({ ...request, reason }).success, false)
  }
})

test("grant plans are exactly the four canonical public plans", () => {
  assert.deepEqual(trialAccessPlanSchema.options, getPublicPlans().map((plan) => plan.id))
  for (const plan of trialAccessPlanSchema.options) {
    assert.equal(validateTrialAccessSource(extension({ plan }), "admin_grant").action, "extend_or_grant")
  }
  for (const plan of ["accountant_partner", "starter", "solo", "business", "pro", "unknown", " essentials", "ESSENTIALS"]) {
    assert.equal(trialAccessPreviewSchema.safeParse({ ...request, plan }).success, false)
  }
})

test("server-selected source requires grant plan and forbids Stripe plan", () => {
  const withoutPlan = extension({ plan: undefined })
  assert.throws(() => validateTrialAccessSource(withoutPlan, "admin_grant"))
  assert.doesNotThrow(() => validateTrialAccessSource(withoutPlan, "stripe_trial"))
  assert.throws(() => validateTrialAccessSource(extension(), "stripe_trial"))
  assert.throws(() => freezeTrialExpiry(withoutPlan, context))
})

test("preview accepts only duration xor specific expiry, with strict types and keys", () => {
  for (const days of [7, 14, 30]) assert.equal(extension({ days }).days, days)
  for (const patch of [
    { days: undefined }, { days: 1 }, { days: 7.5 }, { days: "7" },
    { expiresAt: "2026-10-30T12:00:00Z" }, { days: null },
    { operationId: "not-a-uuid" }, { expectedVersion: -1 }, { expectedVersion: 0.5 },
    { expectedVersion: "0" }, { expectedVersion: Infinity }, { expectedVersion: NaN },
    { expectedVersion: Number.MAX_SAFE_INTEGER + 1 }, { notify: "false" },
    { timeZone: "Not/AZone" }, { timeZone: "+11:00" }, { timeZone: "" },
    { action: "grant" }, { userId: operationId }, { source: "admin_grant" },
  ]) {
    assert.equal(trialAccessPreviewSchema.safeParse({ ...request, ...patch }).success, false, JSON.stringify(patch))
  }
})

test("revocation permits no duration, expiry or plan and keeps safety envelope", () => {
  const revoke = { operationId, action: "revoke_grant", reason: " revoke ", timeZone: "UTC", expectedVersion: 2 }
  assert.deepEqual(trialAccessPreviewSchema.parse(revoke), { ...revoke, reason: "revoke", notify: false })
  for (const patch of [{ days: 7 }, { expiresAt: "2026-10-30T12:00:00Z" }, { plan: "essentials" }, { other: true }, { reason: " " }]) {
    assert.equal(trialAccessPreviewSchema.safeParse({ ...revoke, ...patch }).success, false)
  }
  const parsed = trialAccessPreviewSchema.parse(revoke)
  for (const source of ["admin_grant", "stripe_trial"] as const) {
    assert.deepEqual(validateTrialAccessSource(parsed, source), parsed)
  }
})

test("confirmation is UUID and nonnegative integer version only", () => {
  assert.deepEqual(trialAccessConfirmationSchema.parse({ operationId, expectedVersion: 0 }), { operationId, expectedVersion: 0 })
  for (const patch of [{ operationId: "bad" }, { expectedVersion: -1 }, { expectedVersion: 1.5 }, { expectedVersion: "1" }, { days: 7 }, { notify: false }, { reason: "new" }]) {
    assert.equal(trialAccessConfirmationSchema.safeParse({ operationId, expectedVersion: 1, ...patch }).success, false)
  }
  assert.equal(trialAccessConfirmationSchema.safeParse({ operationId }).success, false)
})

test("elapsed days start at the later of now and the full effective expiry", () => {
  for (const days of [7, 14, 30] as const) {
    for (const current of [null, new Date(now.getTime() - day), now, new Date(now.getTime() + 5 * day)]) {
      const result = freezeTrialExpiry(extension({ days }), { ...context, currentEffectiveTrialExpiry: current })
      assert.equal(result.getTime(), Math.max(now.getTime(), current?.getTime() ?? 0) + days * day)
    }
  }
  const laterContinuity = new Date("2026-11-14T12:00:00Z")
  assert.equal(freezeTrialExpiry(extension({ plan: undefined }), {
    ...context, source: "stripe_trial", currentEffectiveTrialExpiry: laterContinuity,
  }).getTime(), laterContinuity.getTime() + 7 * day)
})

test("duration arithmetic is elapsed 24 hours across DST, not calendar days", () => {
  const start = new Date("2026-10-03T12:00:00Z")
  const result = freezeTrialExpiry(extension(), { ...context, now: start })
  assert.equal(result.getTime() - start.getTime(), 7 * day)
  assert.equal(formatTrialExpiryPreview(start, "Australia/Melbourne").localExpiresAt, "2026-10-03T22:00:00+10:00")
  assert.equal(formatTrialExpiryPreview(result, "Australia/Melbourne").localExpiresAt, "2026-10-10T23:00:00+11:00")
})

test("specific times require an explicit offset and reject invalid calendar rollover", () => {
  for (const expiresAt of [
    "2026-10-30", "2026-10-30T12:00:00", "2026-10-30T12:00:00+1100",
    "2026-02-29T12:00:00Z", "2026-02-30T12:00:00Z", "2026-04-31T12:00:00Z",
    "1900-02-29T12:00:00Z", "2026-00-01T12:00:00Z", "2026-13-01T12:00:00Z",
    "2026-10-00T12:00:00Z", "2026-10-32T12:00:00Z", "2026-10-30T24:00:00Z",
    "2026-10-30T12:60:00Z", "2026-10-30T12:00:60Z", "2026-10-30T12:00:00+24:00",
    "2026-10-30T12:00:00+11:60", "2026-02-30T12:00:00+11:00", "not a date",
  ]) {
    assert.equal(trialAccessPreviewSchema.safeParse({ ...request, days: undefined, expiresAt }).success, false, expiresAt)
  }
  for (const valid of ["2028-02-29T12:00:00Z", "2000-02-29T12:00:00Z", "2026-10-30T12:00Z"]) {
    assert.equal(trialAccessExpirySchema.safeParse(valid).success, true)
  }
})

test("DST gaps and wrong zone offsets are rejected", () => {
  for (const expiresAt of ["2026-10-04T02:30:00+10:00", "2026-10-04T02:30:00+11:00", "2026-10-30T12:00:00+10:00"]) {
    assert.equal(trialAccessPreviewSchema.safeParse({ ...request, days: undefined, expiresAt }).success, false, expiresAt)
  }
  assert.equal(trialAccessPreviewSchema.safeParse({ ...request, days: undefined, expiresAt: "2026-10-30T12:00:00+00:00" }).success, false)
})

test("both explicit DST overlap offsets disambiguate distinct instants", () => {
  const earlier = extension({ days: undefined, expiresAt: "2027-04-04T02:30:00+11:00" })
  const later = extension({ days: undefined, expiresAt: "2027-04-04T02:30:00+10:00" })
  assert.equal(earlier.expiresAt, "2027-04-03T15:30:00.000Z")
  assert.equal(later.expiresAt, "2027-04-03T16:30:00.000Z")
  assert.equal(formatTrialExpiryPreview(new Date(earlier.expiresAt!), request.timeZone).localExpiresAt, "2027-04-04T02:30:00+11:00")
  assert.equal(formatTrialExpiryPreview(new Date(later.expiresAt!), request.timeZone).localExpiresAt, "2027-04-04T02:30:00+10:00")
  for (const expiresAt of ["2027-04-04T02:30:00", "2027-04-04T02:30:00+09:00"]) {
    assert.equal(trialAccessPreviewSchema.safeParse({ ...request, days: undefined, expiresAt }).success, false)
  }
})

test("Z is absolute UTC in any display zone; positive and negative fractional offsets match", () => {
  for (const timeZone of ["Australia/Melbourne", "America/New_York", "Asia/Kathmandu", "UTC"]) {
    assert.equal(extension({ days: undefined, expiresAt: "2026-10-30T12:00:00Z", timeZone }).expiresAt, "2026-10-30T12:00:00.000Z")
  }
  assert.equal(extension({ days: undefined, expiresAt: "2026-10-30T12:00:00+05:45", timeZone: "Asia/Kathmandu" }).expiresAt, "2026-10-30T06:15:00.000Z")
  assert.equal(extension({ days: undefined, expiresAt: "2026-11-30T12:00:00-03:30", timeZone: "America/St_Johns" }).expiresAt, "2026-11-30T15:30:00.000Z")
})

test("preview and all expiry paths floor, never round, to UTC seconds", () => {
  const input = extension({ days: undefined, expiresAt: "2026-10-30T23:00:00.999999+11:00" })
  assert.equal(input.expiresAt, "2026-10-30T12:00:00.000Z")
  assert.equal(freezeTrialExpiry(input, context).toISOString(), input.expiresAt)
  const subsecondNow = new Date("2026-10-14T12:00:00.999Z")
  assert.equal(freezeTrialExpiry(extension(), { ...context, now: subsecondNow }).toISOString(), "2026-10-21T12:00:00.000Z")
  assert.equal(formatTrialExpiryPreview(new Date("2026-10-30T12:00:00.999Z"), "UTC").localExpiresAt, "2026-10-30T12:00:00+00:00")
  assert.throws(() => freezeTrialExpiry(extension({ days: undefined, expiresAt: "2026-10-14T12:00:00.999Z" }), context), /future/)
})

test("specific expiry cannot be non-future, equal to or earlier than effective expiry", () => {
  const current = new Date("2026-10-21T12:00:00Z")
  for (const expiresAt of ["2026-10-01T12:00:00Z", now.toISOString(), "2026-10-20T12:00:00Z", current.toISOString()]) {
    assert.throws(() => freezeTrialExpiry(extension({ days: undefined, expiresAt }), { ...context, currentEffectiveTrialExpiry: current }))
  }
  assert.equal(freezeTrialExpiry(extension({ days: undefined, expiresAt: "2026-10-21T12:00:01Z" }), { ...context, currentEffectiveTrialExpiry: current }).toISOString(), "2026-10-21T12:00:01.000Z")
})

test("730-day application horizon is inclusive and measured from server now", () => {
  const boundary = new Date(now.getTime() + 730 * day)
  assert.equal(validateFrozenTrialExpiry(boundary, context).getTime(), boundary.getTime())
  assert.throws(() => validateFrozenTrialExpiry(new Date(boundary.getTime() + 1000), context), /730-day/)
  assert.throws(() => freezeTrialExpiry(extension(), { ...context, currentEffectiveTrialExpiry: new Date(now.getTime() + 724 * day) }), /730-day/)
  const specific = extension({ days: undefined, expiresAt: new Date(boundary.getTime() + 1000).toISOString() })
  assert.throws(() => freezeTrialExpiry(specific, context), /730-day/)
  // No fabricated Stripe anchor cap: provider validation is a later task.
  assert.doesNotThrow(() => validateFrozenTrialExpiry(new Date(boundary.getTime() + 1000), { ...context, source: "stripe_trial" }))
})

test("confirmation revalidates frozen expiry without adding days or moving the target", () => {
  const frozen = freezeTrialExpiry(extension(), context)
  assert.equal(validateFrozenTrialExpiry(frozen, { ...context, now: new Date(now.getTime() + day) }).getTime(), frozen.getTime())
  assert.throws(() => validateFrozenTrialExpiry(frozen, { ...context, now: frozen }), /future/)
  assert.throws(() => validateFrozenTrialExpiry(frozen, { ...context, currentEffectiveTrialExpiry: frozen }), /strictly later/)
  const nearHorizon = new Date(now.getTime() + 730 * day + day)
  assert.equal(validateFrozenTrialExpiry(nearHorizon, { ...context, now: new Date(now.getTime() + day) }).getTime(), nearHorizon.getTime())
})

test("helpers fail closed on invalid server dates and never mutate input dates", () => {
  for (const patch of [{ now: new Date(NaN) }, { currentEffectiveTrialExpiry: new Date(NaN) }]) {
    assert.throws(() => freezeTrialExpiry(extension(), { ...context, ...patch }), /Invalid server date/)
  }
  assert.throws(() => validateFrozenTrialExpiry(new Date(NaN), context), /Invalid server date/)
  assert.throws(() => formatTrialExpiryPreview(new Date(NaN), "UTC"), /Invalid server date/)
  assert.throws(() => formatTrialExpiryPreview(now, "Not/AZone"))
  const current = new Date(now.getTime() + day)
  const before = [now.getTime(), current.getTime()]
  freezeTrialExpiry(extension(), { ...context, currentEffectiveTrialExpiry: current })
  assert.deepEqual([now.getTime(), current.getTime()], before)
})

test("server preview includes normalized UTC, local date/time, zone and offset", () => {
  assert.deepEqual(formatTrialExpiryPreview(new Date("2026-10-30T12:00:00.987Z"), "Asia/Kathmandu"), {
    expiresAt: "2026-10-30T12:00:00.000Z", localExpiresAt: "2026-10-30T17:45:00+05:45",
    timeZone: "Asia/Kathmandu", offset: "+05:45",
  })
  assert.equal(formatTrialExpiryPreview(new Date("2026-10-30T01:00:00Z"), "America/New_York").localExpiresAt, "2026-10-29T21:00:00-04:00")
})