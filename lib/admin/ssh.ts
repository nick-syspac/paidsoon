/**
 * SSH public key parsing and signature verification utilities for admin challenge-response.
 *
 * Supports:
 *   - Parsing OpenSSH public keys (RFC 4253 wire format, base64-encoded)
 *   - Supported key types: `ssh-ed25519`, `ecdsa-sha2-nistp256`
 *   - Computing SHA-256 fingerprints in `SHA256:<base64>` format
 *   - Verifying `ssh-keygen -Y sign` armoured signatures with a fixed namespace
 *
 * The private key is NEVER stored or transmitted. Only public key verification
 * material and key fingerprint are retained in the database.
 */

import * as crypto from "crypto"

const OPENSSH_ED25519_KEY_TYPE = "ssh-ed25519"
const OPENSSH_ECDSA_P256_KEY_TYPE = "ecdsa-sha2-nistp256"
const OPENSSH_ECDSA_P256_CURVE = "nistp256"
const REQUIRED_NAMESPACE = "paidsoon-admin-auth"

export type SupportedAdminKeyType =
  | typeof OPENSSH_ED25519_KEY_TYPE
  | typeof OPENSSH_ECDSA_P256_KEY_TYPE

export interface ParsedOpenSshPublicKey {
  keyType: SupportedAdminKeyType
  /**
   * Verification key bytes persisted in the DB.
   * - Ed25519: raw 32-byte public key
   * - ECDSA P-256: SPKI DER public key
   */
  publicKeyBytes: Buffer
  fingerprint: string
}

// ---------------------------------------------------------------------------
// Public key parsing
// ---------------------------------------------------------------------------

/**
 * Parse a supported OpenSSH public key string and return verification key
 * material suitable for server-side signature verification.
 */
export function parseOpenSshPublicKey(rawPubKey: string): ParsedOpenSshPublicKey {
  const trimmed = rawPubKey.trim()
  const parts = trimmed.split(/\s+/)

  if (parts.length < 2) {
    throw new Error("Malformed OpenSSH public key: expected at least two space-separated fields")
  }

  const [keyType, b64Data] = parts

  let keyBlob: Buffer
  try {
    keyBlob = Buffer.from(b64Data, "base64")
  } catch {
    throw new Error("Malformed OpenSSH public key: base64 decode failed")
  }

  const fingerprint = computeBlobFingerprint(keyBlob)

  const parsedKeyType = normalizeSupportedKeyType(keyType)
  const parsedBlob = parseOpenSshKeyBlob(keyBlob)

  if (parsedBlob.keyType !== parsedKeyType) {
    throw new Error(`Key blob type mismatch: expected ${parsedKeyType}`)
  }

  if (parsedBlob.keyType === OPENSSH_ED25519_KEY_TYPE) {
    return {
      keyType: parsedBlob.keyType,
      publicKeyBytes: parsedBlob.publicKeyBytes,
      fingerprint,
    }
  }

  return {
    keyType: parsedBlob.keyType,
    publicKeyBytes: parsedBlob.publicKeyBytes,
    fingerprint,
  }
}

/**
 * Backward-compatible helper retained for existing tests and call sites.
 * Throws unless the key is a valid `ssh-ed25519` key.
 */
export function parseOpenSshEd25519PublicKey(rawPubKey: string): Buffer {
  const parsed = parseOpenSshPublicKey(rawPubKey)
  if (parsed.keyType !== OPENSSH_ED25519_KEY_TYPE) {
    throw new Error(`Unsupported key type: ${parsed.keyType}. Only ${OPENSSH_ED25519_KEY_TYPE} is supported.`)
  }
  return parsed.publicKeyBytes
}

function parseOpenSshKeyBlob(
  keyBlob: Buffer
): { keyType: SupportedAdminKeyType; publicKeyBytes: Buffer } {
  // Wire format (RFC 4253):
  //   [4 bytes: length of key type string]
  //   [key type string bytes]
  //   [type-specific fields...]
  let offset = 0

  const { value: keyTypeBytes, nextOffset: afterKeyType } = readBufferString(keyBlob, offset, "Malformed key blob")
  offset = afterKeyType

  const keyType = normalizeSupportedKeyType(keyTypeBytes.toString("utf8"))

  if (keyType === OPENSSH_ED25519_KEY_TYPE) {
    const { value: pubKeyBytes, nextOffset: afterPubKey } = readBufferString(keyBlob, offset, "Malformed key blob")
    offset = afterPubKey

    if (pubKeyBytes.length !== 32) {
      throw new Error(`Invalid Ed25519 public key length: expected 32 bytes, got ${pubKeyBytes.length}`)
    }

    if (offset !== keyBlob.length) {
      throw new Error("Malformed key blob: unexpected trailing bytes")
    }

    return { keyType, publicKeyBytes: Buffer.from(pubKeyBytes) }
  }

  const { value: curveNameBytes, nextOffset: afterCurveName } = readBufferString(keyBlob, offset, "Malformed key blob")
  offset = afterCurveName

  const curveName = curveNameBytes.toString("utf8")
  if (curveName !== OPENSSH_ECDSA_P256_CURVE) {
    throw new Error(`Unsupported ECDSA curve: ${curveName}. Only ${OPENSSH_ECDSA_P256_CURVE} is supported.`)
  }

  const { value: ecPointBytes, nextOffset: afterEcPoint } = readBufferString(keyBlob, offset, "Malformed key blob")
  offset = afterEcPoint

  if (offset !== keyBlob.length) {
    throw new Error("Malformed key blob: unexpected trailing bytes")
  }

  if (ecPointBytes.length !== 65 || ecPointBytes[0] !== 0x04) {
    throw new Error("Invalid P-256 public key point: expected uncompressed 65-byte EC point")
  }

  return {
    keyType,
    publicKeyBytes: buildEcdsaP256SpkiFromUncompressedPoint(Buffer.from(ecPointBytes)),
  }
}

// ---------------------------------------------------------------------------
// Fingerprint computation
// ---------------------------------------------------------------------------

/**
 * Compute the SHA-256 fingerprint of an OpenSSH public key in `SHA256:<base64>` format.
 * This matches the output of `ssh-keygen -l -E sha256 -f <key.pub>`.
 */
export function computeKeyFingerprint(rawPubKey: string): string {
  const trimmed = rawPubKey.trim()
  const parts = trimmed.split(/\s+/)

  if (parts.length < 2) {
    throw new Error("Malformed OpenSSH public key: expected at least two space-separated fields")
  }

  const [, b64Data] = parts

  let keyBlob: Buffer
  try {
    keyBlob = Buffer.from(b64Data, "base64")
  } catch {
    throw new Error("Malformed OpenSSH public key: base64 decode failed")
  }

  return computeBlobFingerprint(keyBlob)
}

function computeBlobFingerprint(keyBlob: Buffer): string {
  const hash = crypto.createHash("sha256").update(keyBlob).digest("base64")
  // Remove trailing '=' padding to match OpenSSH fingerprint format
  return `SHA256:${hash.replace(/=+$/, "")}`
}

// ---------------------------------------------------------------------------
// Signature verification
// ---------------------------------------------------------------------------

/**
 * Options for `verifySshKeySig`.
 */
export interface VerifySshKeySigOpts {
  /** The nonce string that was signed (plain text). */
  nonce: string
  /** The namespace declared in the signature — must be `paidsoon-admin-auth`. */
  namespace: string
  /** The armoured signature output from `ssh-keygen -Y sign`. */
  signature: string
  /** Verification key bytes stored on the device row. */
  publicKeyBytes: Buffer
  /** Enrolled key type on the device row. */
  keyType: string
}

/**
 * Verify an SSH Ed25519 signature produced by:
 *   echo "<nonce>" | ssh-keygen -Y sign -f <key> -n paidsoon-admin-auth
 *
 * Returns `true` if the signature is valid, `false` otherwise.
 * Throws if the namespace is not `paidsoon-admin-auth` or if the signature blob
 * cannot be parsed.
 */
export function verifySshKeySig(opts: VerifySshKeySigOpts): boolean {
  const { nonce, namespace, signature, publicKeyBytes, keyType } = opts

  // Enforce fixed namespace — never accept signatures from another context.
  if (namespace !== REQUIRED_NAMESPACE) {
    throw new Error(`Invalid namespace: expected "${REQUIRED_NAMESPACE}", got "${namespace}"`)
  }

  // Parse the armoured signature produced by `ssh-keygen -Y sign`.
  // The format is PEM-like:
  //   -----BEGIN SSH SIGNATURE-----
  //   <base64-encoded blob>
  //   -----END SSH SIGNATURE-----
  const sigBlob = parseSshSignatureArmour(signature)

  // Parse the SSH signature wire format.
  // Structure (from OpenSSH PROTOCOL.sshsig):
  //   [6 bytes: magic "SSHSIG"]
  //   [uint32: version]
  //   [string: public key]        <- full OpenSSH public key blob
  //   [string: namespace]
  //   [string: reserved]          <- empty
  //   [string: hash_algorithm]    <- "sha512" typically
  //   [string: signature]         <- nested SSH signature blob
  const parsed = parseSshSigBlob(sigBlob)

  if (parsed.namespace !== REQUIRED_NAMESPACE) {
    throw new Error(`Signature namespace mismatch: expected "${REQUIRED_NAMESPACE}", got "${parsed.namespace}"`)
  }

  // The message that was signed is: "SSHSIG" || uint32(version) || hash(namespace) || hash(reserved) || hash(data)
  // Specifically: sha512(nonce + newline) — ssh-keygen hashes the input file content.
  // The signed blob structure is:
  //   "SSHSIG" (6 bytes, no length prefix)
  //   uint32(version)
  //   sha512(namespace)
  //   sha512(reserved == "")
  //   sha512(message)
  // where message = nonce + "\n" (ssh-keygen -Y sign reads from stdin which includes trailing newline via echo)
  const message = buildSshSigMessage({
    namespace: parsed.namespace,
    hashAlgorithm: parsed.hashAlgorithm,
    nonce,
  })

  const parsedKeyType = normalizeSupportedKeyType(keyType)
  if (parsed.signatureType !== parsedKeyType) {
    throw new Error(`Signature key type mismatch: expected ${parsedKeyType}, got ${parsed.signatureType}`)
  }

  const pubKey = createVerificationPublicKey(parsedKeyType, publicKeyBytes)
  const verifyAlgorithm = parsedKeyType === OPENSSH_ED25519_KEY_TYPE ? null : parsed.hashAlgorithm
  const signatureBytes =
    parsedKeyType === OPENSSH_ED25519_KEY_TYPE
      ? parsed.signatureBytes
      : parseEcdsaSshSignatureToDer(parsed.signatureBytes)

  try {
    return crypto.verify(verifyAlgorithm, message, pubKey, signatureBytes)
  } catch {
    return false
  }
}

function createVerificationPublicKey(keyType: SupportedAdminKeyType, publicKeyBytes: Buffer): crypto.KeyObject {
  if (keyType === OPENSSH_ED25519_KEY_TYPE) {
    // Backward compatibility: older rows store raw 32-byte Ed25519 key bytes.
    const derSpki = publicKeyBytes.length === 32 ? buildDerPublicKey(publicKeyBytes) : publicKeyBytes
    return crypto.createPublicKey({ key: derSpki, format: "der", type: "spki" })
  }

  return crypto.createPublicKey({ key: publicKeyBytes, format: "der", type: "spki" })
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function parseSshSignatureArmour(armoured: string): Buffer {
  const begin = "-----BEGIN SSH SIGNATURE-----"
  const end = "-----END SSH SIGNATURE-----"
  const trimmed = armoured.trim()

  const beginIdx = trimmed.indexOf(begin)
  const endIdx = trimmed.indexOf(end)

  if (beginIdx === -1 || endIdx === -1 || endIdx <= beginIdx) {
    throw new Error("Malformed SSH signature: missing armour headers")
  }

  const b64 = trimmed
    .substring(beginIdx + begin.length, endIdx)
    .replace(/\s+/g, "")

  try {
    return Buffer.from(b64, "base64")
  } catch {
    throw new Error("Malformed SSH signature: base64 decode failed")
  }
}

interface ParsedSshSig {
  version: number
  namespace: string
  hashAlgorithm: string
  signatureType: SupportedAdminKeyType
  signatureBytes: Buffer
}

function parseSshSigBlob(blob: Buffer): ParsedSshSig {
  const MAGIC = Buffer.from("SSHSIG")
  if (!blob.subarray(0, 6).equals(MAGIC)) {
    throw new Error("Malformed SSH signature: missing SSHSIG magic")
  }

  let offset = 6

  const readUint32 = (buf: Buffer, pos: number): number => {
    if (pos + 4 > buf.length) throw new Error("Malformed SSH signature blob: unexpected end")
    return buf.readUInt32BE(pos)
  }

  const readString = (buf: Buffer, pos: number): { value: string; raw: Buffer; nextOffset: number } => {
    const len = readUint32(buf, pos)
    const start = pos + 4
    const end = start + len
    if (end > buf.length) throw new Error("Malformed SSH signature blob: string overflow")
    const raw = buf.subarray(start, end)
    return { value: raw.toString("utf8"), raw, nextOffset: end }
  }

  const version = readUint32(blob, offset)
  offset += 4

  if (version !== 1) {
    throw new Error(`Unsupported SSHSIG version: ${version}`)
  }

  // Skip the public key blob embedded in the signature (we verify against stored key)
  const { nextOffset: afterPubKey } = readString(blob, offset)
  offset = afterPubKey

  // Namespace
  const { value: namespace, nextOffset: afterNamespace } = readString(blob, offset)
  offset = afterNamespace

  // Reserved (skip)
  const { nextOffset: afterReserved } = readString(blob, offset)
  offset = afterReserved

  // Hash algorithm
  const { value: hashAlgorithm, nextOffset: afterHashAlg } = readString(blob, offset)
  offset = afterHashAlg

  // Nested signature blob
  const { raw: sigBlobRaw, nextOffset: afterSigBlob } = readString(blob, offset)
  offset = afterSigBlob

  // The nested signature blob is itself a wire-encoded SSH signature:
  //   [string: sig type]
  //   [string: sig bytes]
  const { value: sigType, nextOffset: afterSigType } = readString(sigBlobRaw, 0)
  const signatureType = normalizeSupportedKeyType(sigType)
  const { raw: signatureBytes } = readString(sigBlobRaw, afterSigType)

  return {
    version,
    namespace,
    hashAlgorithm,
    signatureType,
    signatureBytes: Buffer.from(signatureBytes),
  }
}

interface SshSigMessageOpts {
  namespace: string
  hashAlgorithm: string
  nonce: string
}

function buildSshSigMessage(opts: SshSigMessageOpts): Buffer {
  // The data that ssh-keygen signs is defined in PROTOCOL.sshsig §3:
  //   "SSHSIG" (6 bytes, no length prefix)
  //   string(namespace)         <- with length prefix
  //   string(reserved = "")     <- with length prefix
  //   string(hash_algorithm)    <- with length prefix
  //   string(H(message))        <- H is the hash algorithm applied to the message data
  //
  // NOTE: SIG_VERSION is NOT included in the signed data — it is only in the outer
  // blob envelope (PROTOCOL.sshsig §2). Including it here was a bug.
  //
  // The message data is what was piped via stdin: echo "<nonce>" produces "<nonce>\n"
  const { namespace, hashAlgorithm, nonce } = opts

  if (hashAlgorithm !== "sha512" && hashAlgorithm !== "sha256") {
    throw new Error(`Unsupported hash algorithm in signature: ${hashAlgorithm}`)
  }

  const msgData = Buffer.from(nonce + "\n", "utf8")
  const hashedMsg = crypto.createHash(hashAlgorithm).update(msgData).digest()

  const parts: Buffer[] = []

  // Magic (raw bytes, no length prefix)
  parts.push(Buffer.from("SSHSIG"))

  // namespace string
  parts.push(encodeString(namespace))

  // reserved string (empty)
  parts.push(encodeString(""))

  // hash_algorithm string
  parts.push(encodeString(hashAlgorithm))

  // H(message) string
  parts.push(encodeString(hashedMsg))

  return Buffer.concat(parts)
}

function encodeString(value: string | Buffer): Buffer {
  const data = typeof value === "string" ? Buffer.from(value, "utf8") : value
  const len = Buffer.allocUnsafe(4)
  len.writeUInt32BE(data.length)
  return Buffer.concat([len, data])
}

function parseEcdsaSshSignatureToDer(signatureBytes: Buffer): Buffer {
  // OpenSSH ECDSA signature payload: string(r) + string(s)
  let offset = 0
  const { value: rRaw, nextOffset: afterR } = readBufferString(signatureBytes, offset, "Malformed ECDSA signature")
  offset = afterR
  const { value: sRaw, nextOffset: afterS } = readBufferString(signatureBytes, offset, "Malformed ECDSA signature")
  offset = afterS

  if (offset !== signatureBytes.length) {
    throw new Error("Malformed ECDSA signature: unexpected trailing bytes")
  }

  const derR = derIntegerFromUnsigned(Buffer.from(rRaw))
  const derS = derIntegerFromUnsigned(Buffer.from(sRaw))
  return derSequence(Buffer.concat([derR, derS]))
}

function derIntegerFromUnsigned(value: Buffer): Buffer {
  if (value.length === 0) {
    return Buffer.from([0x02, 0x01, 0x00])
  }

  let normalized = Buffer.from(value)

  while (normalized.length > 1 && normalized[0] === 0x00 && (normalized[1] & 0x80) === 0) {
    normalized = normalized.subarray(1)
  }

  if ((normalized[0] & 0x80) !== 0) {
    normalized = Buffer.concat([Buffer.from([0x00]), normalized])
  }

  return Buffer.concat([Buffer.from([0x02]), derLength(normalized.length), normalized])
}

/**
 * Build a DER-encoded SubjectPublicKeyInfo (SPKI) structure for an Ed25519 public key.
 * This is the format accepted by `crypto.createPublicKey({ format: "der", type: "spki" })`.
 *
 * Structure:
 *   SEQUENCE {
 *     SEQUENCE { OID 1.3.101.112 }   <- Ed25519 OID
 *     BIT STRING { 0x00, <32 bytes> }
 *   }
 */
function buildDerPublicKey(rawKeyBytes: Buffer): Buffer {
  // Ed25519 OID: 1.3.101.112 = 06 03 2b 65 70
  const oid = Buffer.from([0x06, 0x03, 0x2b, 0x65, 0x70])
  const algorithmId = derSequence(oid)

  // BIT STRING: 0x03 | length | 0x00 (no unused bits) | key bytes
  const bitString = Buffer.concat([
    Buffer.from([0x03]),
    derLength(rawKeyBytes.length + 1),
    Buffer.from([0x00]),
    rawKeyBytes,
  ])

  const spki = derSequence(Buffer.concat([algorithmId, bitString]))
  return spki
}

function buildEcdsaP256SpkiFromUncompressedPoint(uncompressedPoint: Buffer): Buffer {
  // AlgorithmIdentifier for P-256:
  //   id-ecPublicKey (1.2.840.10045.2.1)
  //   prime256v1 (1.2.840.10045.3.1.7)
  const ecPublicKeyOid = Buffer.from([0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01])
  const prime256v1Oid = Buffer.from([0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07])
  const algorithmId = derSequence(Buffer.concat([ecPublicKeyOid, prime256v1Oid]))

  const bitString = Buffer.concat([
    Buffer.from([0x03]),
    derLength(uncompressedPoint.length + 1),
    Buffer.from([0x00]),
    uncompressedPoint,
  ])

  return derSequence(Buffer.concat([algorithmId, bitString]))
}

function normalizeSupportedKeyType(keyType: string): SupportedAdminKeyType {
  if (keyType === OPENSSH_ED25519_KEY_TYPE || keyType === OPENSSH_ECDSA_P256_KEY_TYPE) {
    return keyType
  }
  throw new Error(
    `Unsupported key type: ${keyType}. Only ${OPENSSH_ED25519_KEY_TYPE} and ${OPENSSH_ECDSA_P256_KEY_TYPE} are supported.`
  )
}

function readUint32(buf: Buffer, pos: number, errPrefix: string): number {
  if (pos + 4 > buf.length) {
    throw new Error(`${errPrefix}: unexpected end of data`)
  }
  return buf.readUInt32BE(pos)
}

function readBufferString(
  buf: Buffer,
  pos: number,
  errPrefix: string
): { value: Buffer; nextOffset: number } {
  const len = readUint32(buf, pos, errPrefix)
  const start = pos + 4
  const end = start + len
  if (end > buf.length) {
    throw new Error(`${errPrefix}: string length exceeds buffer`)
  }
  return { value: buf.subarray(start, end), nextOffset: end }
}

function derSequence(content: Buffer): Buffer {
  const lenBytes = derLength(content.length)
  return Buffer.concat([Buffer.from([0x30]), lenBytes, content])
}

function derLength(len: number): Buffer {
  if (len < 0x80) {
    return Buffer.from([len])
  } else if (len < 0x100) {
    return Buffer.from([0x81, len])
  } else if (len < 0x10000) {
    return Buffer.from([0x82, (len >> 8) & 0xff, len & 0xff])
  }
  throw new Error("DER length too large")
}
