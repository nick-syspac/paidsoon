import test from "node:test"
import assert from "node:assert/strict"
import {
  parseLiveEnv,
  shouldBlockAuthEntry,
  shouldShowNotLiveBanner,
} from "@/lib/liveMode"

test("LIVE=true keeps auth enabled and hides not-live banner", () => {
  const liveMode = parseLiveEnv("true")

  assert.equal(liveMode, true)
  assert.equal(shouldBlockAuthEntry("/sign-in", liveMode), false)
  assert.equal(shouldBlockAuthEntry("/sign-up", liveMode), false)
  assert.equal(shouldShowNotLiveBanner(liveMode), false)
})

test("LIVE=false disables auth entry points and shows not-live banner", () => {
  const liveMode = parseLiveEnv("false")

  assert.equal(liveMode, false)
  assert.equal(shouldBlockAuthEntry("/sign-in", liveMode), true)
  assert.equal(shouldBlockAuthEntry("/sign-up", liveMode), true)
  assert.equal(shouldShowNotLiveBanner(liveMode), true)
})

test("missing or malformed LIVE falls back to not-live mode", () => {
  const missing = parseLiveEnv(undefined)
  const malformed = parseLiveEnv("not-a-bool")

  assert.equal(missing, false)
  assert.equal(malformed, false)
  assert.equal(shouldBlockAuthEntry("/sign-in", missing), true)
  assert.equal(shouldShowNotLiveBanner(malformed), true)
})
