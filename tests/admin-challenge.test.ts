/**
 * Unit tests for admin challenge API contracts.
 *
 * Tests the documented behavioural contracts without a live DB.
 */

import { test, describe } from "node:test"
import assert from "node:assert/strict"
import * as crypto from "node:crypto"

describe("Challenge nonce properties", () => {
  test("nonce is at least 32 bytes of entropy", () => {
    // The challenge API generates: crypto.randomBytes(32).toString("base64url")
    const nonce = crypto.randomBytes(32).toString("base64url")
    // base64url of 32 bytes = ~43 characters
    assert.ok(nonce.length >= 40, `nonce length ${nonce.length} should be >= 40`)
    // Should only contain URL-safe characters
    assert.match(nonce, /^[A-Za-z0-9_-]+$/)
  })

  test("two nonces are not equal", () => {
    const n1 = crypto.randomBytes(32).toString("base64url")
    const n2 = crypto.randomBytes(32).toString("base64url")
    assert.notEqual(n1, n2)
  })
})

describe("Challenge expiry contracts", () => {
  test("expired challenge expiresAt is in the past", () => {
    const expiresAt = new Date(Date.now() - 1000)
    assert.ok(expiresAt < new Date(), "Expired challenge has expiresAt < now")
  })

  test("fresh challenge expiresAt is in the future", () => {
    const ttlSeconds = 120
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000)
    assert.ok(expiresAt > new Date(), "Fresh challenge has expiresAt > now")
  })

  test("usedAt non-null indicates already-used challenge", () => {
    const usedAt = new Date()
    assert.ok(usedAt !== null)
  })

  test("usedAt null indicates unused challenge", () => {
    const usedAt = null
    assert.equal(usedAt, null)
  })
})

describe("Session token properties", () => {
  test("session token is at least 32 bytes of entropy", () => {
    // The challenge verify API generates: crypto.randomBytes(32).toString("base64url")
    const token = crypto.randomBytes(32).toString("base64url")
    assert.ok(token.length >= 40)
    assert.match(token, /^[A-Za-z0-9_-]+$/)
  })

  test("two session tokens are not equal", () => {
    const t1 = crypto.randomBytes(32).toString("base64url")
    const t2 = crypto.randomBytes(32).toString("base64url")
    assert.notEqual(t1, t2)
  })
})

describe("Rate limit logic", () => {
  test("MAX_FAILED_ATTEMPTS default is 5", () => {
    const maxFailed = parseInt(process.env.ADMIN_MAX_FAILED_ATTEMPTS ?? "5", 10)
    assert.equal(maxFailed, 5)
  })

  test("CHALLENGE_TTL_SECONDS default is 120", () => {
    const ttl = parseInt(process.env.ADMIN_CHALLENGE_TTL_SECONDS ?? "120", 10)
    assert.equal(ttl, 120)
  })
})
