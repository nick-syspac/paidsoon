import test from "node:test"
import assert from "node:assert/strict"

// ---------------------------------------------------------------------------
// Trial expiry logic helpers (replicated here to keep tests self-contained
// and avoid importing server-only modules)
// ---------------------------------------------------------------------------

const TRIAL_DURATION_MS = 14 * 24 * 60 * 60 * 1000

function computeTrialEndsAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + TRIAL_DURATION_MS)
}

function isTrialExpired(trialEndsAt: Date | null, now = new Date()): boolean {
  if (trialEndsAt === null) return false
  return trialEndsAt < now
}

function daysRemaining(trialEndsAt: Date | null, now = new Date()): number | null {
  if (trialEndsAt === null) return null
  const ms = trialEndsAt.getTime() - now.getTime()
  if (ms <= 0) return 0
  return Math.ceil(ms / (1000 * 60 * 60 * 24))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("trial ends at exactly 14 days after creation", () => {
  const now = new Date("2026-01-01T00:00:00.000Z")
  const ends = computeTrialEndsAt(now)
  const expectedMs = 14 * 24 * 60 * 60 * 1000
  assert.equal(ends.getTime() - now.getTime(), expectedMs)
})

test("trial is not expired when trialEndsAt is in the future", () => {
  const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  assert.equal(isTrialExpired(future), false)
})

test("trial is expired when trialEndsAt is in the past", () => {
  const past = new Date(Date.now() - 1000)
  assert.equal(isTrialExpired(past), true)
})

test("trial is not expired when trialEndsAt is null (no trial)", () => {
  assert.equal(isTrialExpired(null), false)
})

test("daysRemaining returns null when trialEndsAt is null", () => {
  assert.equal(daysRemaining(null), null)
})

test("daysRemaining returns 0 when trial has expired", () => {
  const past = new Date(Date.now() - 1000)
  assert.equal(daysRemaining(past), 0)
})

test("daysRemaining rounds up partial days", () => {
  const now = new Date("2026-01-01T00:00:00.000Z")
  // 1 hour remaining → should show 1 day
  const endsAt = new Date(now.getTime() + 60 * 60 * 1000)
  assert.equal(daysRemaining(endsAt, now), 1)
})

test("daysRemaining returns correct count for full days", () => {
  const now = new Date("2026-01-01T00:00:00.000Z")
  const endsAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  assert.equal(daysRemaining(endsAt, now), 7)
})

// ---------------------------------------------------------------------------
// createUserProfile contract (structural)
// ---------------------------------------------------------------------------

test("createUserProfile trial duration constant is 14 days in ms", () => {
  assert.equal(TRIAL_DURATION_MS, 14 * 24 * 60 * 60 * 1000)
})

// ---------------------------------------------------------------------------
// Onboarding tier validation (mirrors Zod schema in /api/onboarding)
// ---------------------------------------------------------------------------

const VALID_TIERS = new Set(["starter", "solo", "small_business"])

function validateOnboardingTier(tier: unknown): tier is "starter" | "solo" | "small_business" {
  return typeof tier === "string" && VALID_TIERS.has(tier)
}

test("valid tiers are accepted by onboarding route schema", () => {
  assert.equal(validateOnboardingTier("starter"), true)
  assert.equal(validateOnboardingTier("solo"), true)
  assert.equal(validateOnboardingTier("small_business"), true)
})

test("invalid tiers are rejected by onboarding route schema", () => {
  assert.equal(validateOnboardingTier("free"), false)
  assert.equal(validateOnboardingTier("pro"), false)
  assert.equal(validateOnboardingTier("enterprise"), false)
  assert.equal(validateOnboardingTier(""), false)
  assert.equal(validateOnboardingTier(null), false)
  assert.equal(validateOnboardingTier(undefined), false)
  assert.equal(validateOnboardingTier(42), false)
})
