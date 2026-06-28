/**
 * Unit tests for lib/admin/ssh.ts
 *
 * Tests use a pre-generated Ed25519 key pair (no live SSH agent required).
 * The signature fixtures were generated with:
 *   ssh-keygen -t ed25519 -f /tmp/test_admin_ed25519 -N ""
 *   echo "test-nonce-abc123" | ssh-keygen -Y sign -f /tmp/test_admin_ed25519 -n paidsoon-admin-auth
 *
 * For test isolation, we generate keys and signatures programmatically using
 * Node's built-in crypto module — no external tools required in CI.
 */

import { test, describe } from "node:test"
import assert from "node:assert/strict"
import * as crypto from "node:crypto"
import {
  parseOpenSshEd25519PublicKey,
  computeKeyFingerprint,
  verifySshKeySig,
} from "@/lib/admin/ssh"

// ---------------------------------------------------------------------------
// Test key pair generation helpers
// ---------------------------------------------------------------------------

/**
 * Generate an Ed25519 key pair and return the public key in OpenSSH format
 * along with the raw 32-byte public key bytes.
 */
function generateTestKeyPair() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519")

  // Export raw 32-byte public key
  const spki = publicKey.export({ format: "der", type: "spki" })
  // Last 32 bytes of SPKI are the raw public key
  const rawPubKeyBytes = Buffer.from(spki.subarray(spki.length - 32))

  // Build OpenSSH public key wire format
  const keyTypeStr = "ssh-ed25519"
  const keyTypeBuf = Buffer.from(keyTypeStr, "utf8")
  const keyTypeLenBuf = Buffer.allocUnsafe(4)
  keyTypeLenBuf.writeUInt32BE(keyTypeBuf.length)

  const pubKeyLenBuf = Buffer.allocUnsafe(4)
  pubKeyLenBuf.writeUInt32BE(rawPubKeyBytes.length)

  const wireBlob = Buffer.concat([keyTypeLenBuf, keyTypeBuf, pubKeyLenBuf, rawPubKeyBytes])
  const b64 = wireBlob.toString("base64")
  const rawPubKey = `${keyTypeStr} ${b64} test-key`

  return { privateKey, publicKey, rawPubKey, rawPubKeyBytes }
}

/**
 * Produce an SSH signature blob (SSHSIG wire format) for a given nonce,
 * namespace, and private key — mimicking `ssh-keygen -Y sign` output.
 */
function signNonce(nonce: string, namespace: string, privateKey: crypto.KeyObject): string {
  const hashAlgorithm = "sha512"
  const msgData = Buffer.from(nonce + "\n", "utf8")
  const hashedMsg = crypto.createHash(hashAlgorithm).update(msgData).digest()

  // Get the public key from the private key
  const pubKey = crypto.createPublicKey(privateKey)
  const spkiDer = pubKey.export({ format: "der", type: "spki" })
  const rawPubKeyBytes = Buffer.from(spkiDer.subarray(spkiDer.length - 32))

  const keyTypeStr = "ssh-ed25519"
  const keyTypeBuf = Buffer.from(keyTypeStr, "utf8")
  const keyTypeLenBuf = Buffer.allocUnsafe(4)
  keyTypeLenBuf.writeUInt32BE(keyTypeBuf.length)
  const rawPubKeyLenBuf = Buffer.allocUnsafe(4)
  rawPubKeyLenBuf.writeUInt32BE(rawPubKeyBytes.length)
  const pubKeyWire = Buffer.concat([keyTypeLenBuf, keyTypeBuf, rawPubKeyLenBuf, rawPubKeyBytes])

  // Build the message to sign (SSHSIG wire format)
  const encodeStr = (s: string | Buffer) => {
    const d = typeof s === "string" ? Buffer.from(s, "utf8") : s
    const l = Buffer.allocUnsafe(4)
    l.writeUInt32BE(d.length)
    return Buffer.concat([l, d])
  }
  const encodeUint32 = (n: number) => {
    const b = Buffer.allocUnsafe(4)
    b.writeUInt32BE(n)
    return b
  }

  // PROTOCOL.sshsig §3: signed data does NOT include SIG_VERSION — only the outer blob does.
  const toSign = Buffer.concat([
    Buffer.from("SSHSIG"),
    encodeStr(namespace),
    encodeStr(""),
    encodeStr(hashAlgorithm),
    encodeStr(hashedMsg),
  ])

  // Sign
  const sigBytes = crypto.sign(null, toSign, privateKey)

  // Build nested sig blob: [string: type][string: sig bytes]
  const nestedSigBlob = Buffer.concat([encodeStr(keyTypeStr), encodeStr(sigBytes)])

  // Build full SSHSIG blob
  const sigBlob = Buffer.concat([
    Buffer.from("SSHSIG"),
    encodeUint32(1),
    encodeStr(pubKeyWire),
    encodeStr(namespace),
    encodeStr(""),
    encodeStr(hashAlgorithm),
    encodeStr(nestedSigBlob),
  ])

  const b64 = sigBlob.toString("base64").match(/.{1,64}/g)!.join("\n")
  return `-----BEGIN SSH SIGNATURE-----\n${b64}\n-----END SSH SIGNATURE-----\n`
}

// ---------------------------------------------------------------------------
// parseOpenSshEd25519PublicKey
// ---------------------------------------------------------------------------

describe("parseOpenSshEd25519PublicKey", () => {
  test("extracts 32-byte public key from valid ssh-ed25519 public key string", () => {
    const { rawPubKey, rawPubKeyBytes } = generateTestKeyPair()
    const parsed = parseOpenSshEd25519PublicKey(rawPubKey)
    assert.equal(parsed.length, 32)
    assert.ok(parsed.equals(rawPubKeyBytes))
  })

  test("throws on non-ed25519 key type", () => {
    assert.throws(
      () => parseOpenSshEd25519PublicKey("ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQC test"),
      /Unsupported key type/
    )
  })

  test("throws on malformed base64 blob", () => {
    // Buffer.from with base64 is lenient; the blob parse will fail with truncated data
    assert.throws(
      () => parseOpenSshEd25519PublicKey("ssh-ed25519 not!!valid!!base64"),
      /Malformed/
    )
  })

  test("throws on missing key parts", () => {
    assert.throws(
      () => parseOpenSshEd25519PublicKey("ssh-ed25519"),
      /Malformed OpenSSH public key/
    )
  })

  test("throws on wrong key type inside blob", () => {
    // Craft a blob with wrong internal key type
    const encStr = (s: string) => {
      const d = Buffer.from(s)
      const l = Buffer.allocUnsafe(4)
      l.writeUInt32BE(d.length)
      return Buffer.concat([l, d])
    }
    const fakeBytes = crypto.randomBytes(32)
    const fakeLenBuf = Buffer.allocUnsafe(4)
    fakeLenBuf.writeUInt32BE(fakeBytes.length)
    const blob = Buffer.concat([encStr("ssh-rsa"), fakeLenBuf, fakeBytes])
    const rawPubKey = `ssh-ed25519 ${blob.toString("base64")}`
    assert.throws(
      () => parseOpenSshEd25519PublicKey(rawPubKey),
      /Key blob type mismatch/
    )
  })
})

// ---------------------------------------------------------------------------
// computeKeyFingerprint
// ---------------------------------------------------------------------------

describe("computeKeyFingerprint", () => {
  test("returns SHA256:<base64> format fingerprint", () => {
    const { rawPubKey } = generateTestKeyPair()
    const fp = computeKeyFingerprint(rawPubKey)
    assert.match(fp, /^SHA256:[A-Za-z0-9+/]{43}$/)
  })

  test("returns consistent fingerprint for same key", () => {
    const { rawPubKey } = generateTestKeyPair()
    assert.equal(computeKeyFingerprint(rawPubKey), computeKeyFingerprint(rawPubKey))
  })

  test("returns different fingerprints for different keys", () => {
    const { rawPubKey: key1 } = generateTestKeyPair()
    const { rawPubKey: key2 } = generateTestKeyPair()
    assert.notEqual(computeKeyFingerprint(key1), computeKeyFingerprint(key2))
  })
})

// ---------------------------------------------------------------------------
// verifySshKeySig
// ---------------------------------------------------------------------------

describe("verifySshKeySig", () => {
  test("valid signature verifies successfully", () => {
    const { privateKey, rawPubKey: _rawPubKey, rawPubKeyBytes } = generateTestKeyPair()
    const nonce = "abc123-test-nonce"
    const sig = signNonce(nonce, "paidsoon-admin-auth", privateKey)

    const result = verifySshKeySig({
      nonce,
      namespace: "paidsoon-admin-auth",
      signature: sig,
      publicKeyBytes: rawPubKeyBytes,
    })
    assert.equal(result, true)
  })

  test("invalid signature is rejected", () => {
    const { rawPubKey: _rawPubKey, rawPubKeyBytes } = generateTestKeyPair()
    const { privateKey: otherKey } = generateTestKeyPair()
    const nonce = "abc123-test-nonce"
    // Sign with a different key
    const sig = signNonce(nonce, "paidsoon-admin-auth", otherKey)

    const result = verifySshKeySig({
      nonce,
      namespace: "paidsoon-admin-auth",
      signature: sig,
      publicKeyBytes: rawPubKeyBytes,
    })
    assert.equal(result, false)
  })

  test("wrong nonce causes rejection", () => {
    const { privateKey, rawPubKeyBytes } = generateTestKeyPair()
    const sig = signNonce("correct-nonce", "paidsoon-admin-auth", privateKey)

    const result = verifySshKeySig({
      nonce: "wrong-nonce",
      namespace: "paidsoon-admin-auth",
      signature: sig,
      publicKeyBytes: rawPubKeyBytes,
    })
    assert.equal(result, false)
  })

  test("wrong namespace throws", () => {
    const { privateKey, rawPubKeyBytes } = generateTestKeyPair()
    const sig = signNonce("nonce", "paidsoon-admin-auth", privateKey)

    assert.throws(
      () =>
        verifySshKeySig({
          nonce: "nonce",
          namespace: "wrong-namespace",
          signature: sig,
          publicKeyBytes: rawPubKeyBytes,
        }),
      /Invalid namespace/
    )
  })

  test("malformed signature throws", () => {
    const { rawPubKeyBytes } = generateTestKeyPair()
    assert.throws(
      () =>
        verifySshKeySig({
          nonce: "nonce",
          namespace: "paidsoon-admin-auth",
          signature: "not-a-valid-signature",
          publicKeyBytes: rawPubKeyBytes,
        }),
      /Malformed SSH signature/
    )
  })

  test("malformed public key bytes (wrong length) cause crypto error", () => {
    const { privateKey } = generateTestKeyPair()
    const sig = signNonce("nonce", "paidsoon-admin-auth", privateKey)

    assert.throws(
      () =>
        verifySshKeySig({
          nonce: "nonce",
          namespace: "paidsoon-admin-auth",
          signature: sig,
          publicKeyBytes: Buffer.from("tooshort"),
        })
    )
  })
})
