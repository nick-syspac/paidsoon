# admin-device-registry Specification

## Purpose
TBD - created by archiving change add-secure-platform-admin-access. Update Purpose after archive.
## Requirements
### Requirement: Admin device registry stores SSH public keys only
The system SHALL maintain an `AdminDevice` table storing the SSH public key, key fingerprint, key type, label, status, and audit metadata for each approved admin device. The SSH private key SHALL NOT be stored anywhere in the system (database, environment variables, logs, browser storage). Only devices with `status = active` SHALL be usable for admin verification.

#### Scenario: Device is enrolled with valid Ed25519 public key
- **WHEN** an admin submits a valid `ssh-ed25519` public key for a new device
- **THEN** the system creates an `AdminDevice` row with `status = active`, the parsed public key bytes, and the computed SHA-256 fingerprint

#### Scenario: Duplicate key fingerprint is rejected
- **WHEN** an admin attempts to enrol a device with a fingerprint that already exists in `AdminDevice`
- **THEN** the request is rejected with 409

#### Scenario: Invalid key format is rejected
- **WHEN** an admin submits a string that is not a valid OpenSSH `ssh-ed25519` public key
- **THEN** the request is rejected with 400

#### Scenario: Private key cannot be stored
- **WHEN** any code path attempts to persist an SSH private key material
- **THEN** no such field exists in the schema and the operation fails at the type level

---

### Requirement: Admin device status transitions
An `AdminDevice` SHALL transition through the statuses `pending → active → revoked` or `active → expired`. Revoked and expired devices SHALL never authenticate. A revocation timestamp and revoking admin's user ID SHALL be recorded.

#### Scenario: Revoked device cannot be used for challenge verification
- **WHEN** an admin challenge is signed by the key of a revoked device
- **THEN** the verify endpoint rejects the request with 403 and logs the attempt

#### Scenario: Expired device cannot be used for challenge verification
- **WHEN** an admin challenge is signed by the key of an expired device
- **THEN** the verify endpoint rejects the request with 403 and logs the attempt

#### Scenario: Revocation is immediately effective
- **WHEN** a `platform_owner` revokes a device via `/api/admin/devices/{device_id}/revoke`
- **THEN** the device `status` is set to `revoked` and all `AdminSession` rows associated with that device are deleted immediately

---

### Requirement: Device enrolment requires admin context for non-first device
The first admin device for the platform owner SHALL be enrollable via the `seed:admin-owner` bootstrap script. Subsequent devices SHALL require an active elevated admin session to enrol.

#### Scenario: First device is enrolled during bootstrap
- **WHEN** `npm run seed:admin-owner` is run with `ADMIN_SSH_PUBLIC_KEY` set in the environment
- **THEN** an `AdminDevice` row is created for the owner with `status = active`

#### Scenario: Additional device requires elevated session
- **WHEN** an admin with an active elevated session POSTs a new public key to `/api/admin/devices`
- **THEN** a new `AdminDevice` row is created for them

#### Scenario: Unelevated user cannot enrol a device
- **WHEN** a user without an active elevated admin session POSTs to `/api/admin/devices`
- **THEN** the request is rejected with 401

---

### Requirement: Device enrolment and revocation are audited
Every device enrolment and revocation event SHALL create an `AdminAuditEvent` row capturing actor, device fingerprint, action, timestamp, IP address, and user agent.

#### Scenario: Device enrolment creates audit event
- **WHEN** a new admin device is successfully enrolled
- **THEN** an `AdminAuditEvent` with `action = device_enrolled` is created

#### Scenario: Device revocation creates audit event
- **WHEN** a device is revoked
- **THEN** an `AdminAuditEvent` with `action = device_revoked` is created

---

### Requirement: Device registry is visible to platform owner and admins
A `platform_owner` or `platform_admin` SHALL be able to list all `AdminDevice` rows, filtered by user and status. The response SHALL include label, fingerprint, status, last used IP, last used timestamp, and creation date. The raw public key bytes SHALL be omitted from list responses.

#### Scenario: Owner can list all admin devices
- **WHEN** a `platform_owner` GETs `/api/admin/devices`
- **THEN** the response lists all `AdminDevice` rows with safe fields only

#### Scenario: Raw public key bytes are not returned
- **WHEN** any admin API returns device data
- **THEN** the `publicKeyBytes` field is not present in the response payload

