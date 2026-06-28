## ADDED Requirements

### Requirement: Server issues a one-time challenge nonce
The system SHALL create an `AdminChallenge` row containing a cryptographically random nonce (minimum 32 bytes, URL-safe base64 encoded) when a `platform_admin` or `platform_owner` with a valid Supabase session requests admin elevation. The challenge SHALL expire after `ADMIN_CHALLENGE_TTL_SECONDS` (default 120 seconds). The challenge SHALL be single-use.

#### Scenario: Challenge is created for eligible admin
- **WHEN** an authenticated user with a platform role POSTs to `/api/admin/challenges`
- **THEN** the system returns a challenge nonce and challenge ID

#### Scenario: Challenge is not created for non-admin user
- **WHEN** an authenticated user with no platform role POSTs to `/api/admin/challenges`
- **THEN** the request is rejected with 403

#### Scenario: Challenge expires after TTL
- **WHEN** a challenge nonce is not verified within `ADMIN_CHALLENGE_TTL_SECONDS`
- **THEN** the verify endpoint rejects it with 401 and an `expired` reason code

---

### Requirement: Admin signs the challenge using SSH key on the trusted machine
The admin operator SHALL sign the challenge nonce locally using:
```
echo "<nonce>" | ssh-keygen -Y sign -f <private_key_path> -n paidsoon-admin-auth
```
The SSH private key SHALL remain on the trusted machine at all times. The signed output (in OpenSSH `ssh-keygen -Y sign` armoured format) is submitted to the server.

#### Scenario: Signing instruction is documented in admin setup guide
- **WHEN** the admin onboarding documentation is accessed
- **THEN** the exact signing command with the correct namespace is documented

---

### Requirement: Server verifies SSH signature against registered public key
The verify endpoint SHALL parse the submitted signature (OpenSSH `ssh-keygen -Y sign` armoured format), extract the Ed25519 signature bytes, and verify them against the challenge nonce using the `publicKeyBytes` stored in the `AdminDevice` row for the specified device. The namespace `paidsoon-admin-auth` SHALL be validated as part of the signature structure. Verification SHALL use Node.js built-in `crypto.verify` for Ed25519.

#### Scenario: Valid signature from active device creates elevated session
- **WHEN** an admin submits a valid Ed25519 signature for an active device over the correct challenge nonce
- **THEN** the verify endpoint returns success and a short-lived elevated `AdminSession` is created

#### Scenario: Invalid signature is rejected
- **WHEN** an admin submits a signature that does not verify against the stored public key
- **THEN** the verify endpoint returns 401 with `reason = invalid_signature`

#### Scenario: Wrong namespace is rejected
- **WHEN** a signature is submitted that was generated with a namespace other than `paidsoon-admin-auth`
- **THEN** the verify endpoint returns 401 with `reason = invalid_namespace`

#### Scenario: Signature for revoked device is rejected
- **WHEN** an admin submits a valid signature but the device is revoked
- **THEN** the verify endpoint returns 403 with `reason = device_revoked`

#### Scenario: Expired challenge is rejected
- **WHEN** the challenge `expiresAt` has passed at the time of verification
- **THEN** the verify endpoint returns 401 with `reason = challenge_expired`

#### Scenario: Reused challenge is rejected
- **WHEN** an admin submits a valid signature for a challenge that has already been used
- **THEN** the verify endpoint returns 401 with `reason = challenge_already_used`

---

### Requirement: Failed challenge attempts are rate-limited and audited
After `ADMIN_MAX_FAILED_ATTEMPTS` (default 5) consecutive failed verification attempts for a user within a rolling window, the system SHALL block further challenge creation for that user for a cooldown period. Every failed attempt SHALL create an `AdminAuditEvent` row.

#### Scenario: Repeated failures trigger rate limit
- **WHEN** a user has `ADMIN_MAX_FAILED_ATTEMPTS` or more consecutive failed challenge verifications
- **THEN** the next challenge creation request is rejected with 429 until the cooldown expires

#### Scenario: Failed attempt is audited
- **WHEN** a challenge verification fails for any reason
- **THEN** an `AdminAuditEvent` row is created with `action = admin_challenge_failed`, `success = false`, and the failure reason

---

### Requirement: Challenge creation and verification are audited
Every challenge lifecycle event SHALL create an `AdminAuditEvent` row with the actor, device ID (if known), action, IP address, user agent, and success/failure status.

#### Scenario: Challenge created event is logged
- **WHEN** a challenge is successfully created
- **THEN** an `AdminAuditEvent` with `action = admin_challenge_created` is written

#### Scenario: Challenge verified event is logged
- **WHEN** a challenge is successfully verified
- **THEN** an `AdminAuditEvent` with `action = admin_challenge_verified` and `success = true` is written
