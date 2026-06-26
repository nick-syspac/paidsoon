/**
 * Token encryption utility for accounting provider OAuth tokens.
 *
 * Uses AES-256-GCM authenticated encryption. The key is loaded from the
 * TOKEN_ENCRYPTION_KEY environment variable, which must be a 64-character
 * hex string (32 bytes = 256 bits).
 *
 * Encrypted format: `<iv_hex>:<authTag_hex>:<ciphertext_hex>` — all hex-encoded,
 * colon-separated. This is stored as a plain string in the DB column.
 *
 * TODO: Key rotation — to rotate TOKEN_ENCRYPTION_KEY, write a one-off migration
 * script that reads every accounting_connections row, decrypts with the old key,
 * re-encrypts with the new key, and updates the row. Do not run in production
 * without a tested rollback plan.
 *
 * Security notes:
 * - A fresh 12-byte IV is generated for every encryption call (never reuse IVs).
 * - The auth tag ensures ciphertext integrity — tampered tokens will throw on decrypt.
 * - Plaintext tokens are never assigned to variables with a lifetime beyond the call.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto"

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12   // 96-bit IV — recommended for GCM
const TAG_LENGTH = 16  // 128-bit auth tag

function getKey(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY
  if (!raw) {
    throw new Error("TOKEN_ENCRYPTION_KEY environment variable is not set")
  }
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY must be a 64-character hex string (32 bytes / 256 bits)"
    )
  }
  return Buffer.from(raw, "hex")
}

/**
 * Encrypt a plaintext token string.
 * Returns a colon-delimited hex string: `<iv>:<authTag>:<ciphertext>`
 */
export function encryptToken(plaintext: string): string {
  const key = getKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH })

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()

  return [
    iv.toString("hex"),
    authTag.toString("hex"),
    encrypted.toString("hex"),
  ].join(":")
}

/**
 * Decrypt an encrypted token string produced by `encryptToken`.
 * Throws if the token has been tampered with (auth tag mismatch).
 */
export function decryptToken(encrypted: string): string {
  const parts = encrypted.split(":")
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted token format — expected iv:authTag:ciphertext")
  }
  const [ivHex, authTagHex, ciphertextHex] = parts

  const key = getKey()
  const iv = Buffer.from(ivHex, "hex")
  const authTag = Buffer.from(authTagHex, "hex")
  const ciphertext = Buffer.from(ciphertextHex, "hex")

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH })
  decipher.setAuthTag(authTag)

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ])

  return decrypted.toString("utf8")
}
