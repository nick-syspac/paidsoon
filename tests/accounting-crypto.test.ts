import { test, describe, before, after } from "node:test"
import assert from "node:assert/strict"
import { encryptToken, decryptToken } from "@/lib/providers/accounting/crypto"

// Set a test key before all tests
const TEST_KEY = "a".repeat(64) // 64 hex chars = 32 bytes, valid for AES-256

describe("encryptToken / decryptToken", () => {
  before(() => {
    process.env.TOKEN_ENCRYPTION_KEY = TEST_KEY
  })

  after(() => {
    delete process.env.TOKEN_ENCRYPTION_KEY
  })

  test("roundtrip: decrypt(encrypt(plaintext)) === plaintext", () => {
    const plaintext = "test-access-token-abc123"
    const encrypted = encryptToken(plaintext)
    const decrypted = decryptToken(encrypted)
    assert.equal(decrypted, plaintext)
  })

  test("encrypted output never equals plaintext input", () => {
    const plaintext = "super-secret-token"
    const encrypted = encryptToken(plaintext)
    assert.notEqual(encrypted, plaintext)
  })

  test("encrypted output has iv:authTag:ciphertext format", () => {
    const encrypted = encryptToken("any-token")
    const parts = encrypted.split(":")
    assert.equal(parts.length, 3, "should have exactly 3 colon-delimited parts")
    // IV: 12 bytes = 24 hex chars
    assert.equal(parts[0].length, 24)
    // AuthTag: 16 bytes = 32 hex chars
    assert.equal(parts[1].length, 32)
  })

  test("two encryptions of the same plaintext produce different ciphertexts (IV randomness)", () => {
    const plaintext = "same-token"
    const enc1 = encryptToken(plaintext)
    const enc2 = encryptToken(plaintext)
    assert.notEqual(enc1, enc2, "IVs should differ between calls")
  })

  test("tampered ciphertext throws on decrypt", () => {
    const encrypted = encryptToken("original-token")
    const parts = encrypted.split(":")
    // Corrupt the last byte of the ciphertext
    const badCiphertext =
      parts[2].slice(0, -2) +
      (parts[2].slice(-2) === "ff" ? "00" : "ff")
    const tampered = [parts[0], parts[1], badCiphertext].join(":")
    assert.throws(
      () => decryptToken(tampered),
      (err: unknown) => err instanceof Error,
      "should throw when auth tag verification fails"
    )
  })

  test("throws when TOKEN_ENCRYPTION_KEY is not set", () => {
    delete process.env.TOKEN_ENCRYPTION_KEY
    assert.throws(
      () => encryptToken("test"),
      /TOKEN_ENCRYPTION_KEY environment variable is not set/
    )
    // restore for subsequent tests
    process.env.TOKEN_ENCRYPTION_KEY = TEST_KEY
  })

  test("throws when TOKEN_ENCRYPTION_KEY has wrong length", () => {
    process.env.TOKEN_ENCRYPTION_KEY = "tooshort"
    assert.throws(
      () => encryptToken("test"),
      /TOKEN_ENCRYPTION_KEY must be a 64-character hex string/
    )
    // restore
    process.env.TOKEN_ENCRYPTION_KEY = TEST_KEY
  })
})
