## Why

PaidSoon’s auth and account recovery flow must support a locked-out customer without developer intervention. The release audit highlights that the password-reset flow is not yet proven to be a safe, end-to-end, production-ready recovery path. Even where helper functions exist, a real customer recovery workflow requires verifying the actual live Supabase configuration, UI flow, and operator confidence in the system.

## What Changes

- Define a verified production password-recovery flow using the real Supabase auth integration.
- Confirm the reset-request page, recovery callback, and password-update path work together without manual DB changes.
- Verify the system behaves safely for invalid or expired recovery links and for unknown emails.
- Add release-level tests that validate the customer experience rather than just helper contracts.

## Capabilities

### New Capabilities
- `customer-password-recovery`: a safe self-service recovery flow for account access.

### Modified Capabilities
- `auth-safety`: ensure customer recovery is supported without compromising account enumeration or trust.
- `operator-support`: reduce the amount of manual intervention needed when a user is locked out.

## Impact

- Affected code:
  - `lib/auth/passwordReset.ts`
  - `app/(auth)/forgot-password/page.tsx`
  - `app/(auth)/reset-password/page.tsx`
  - related auth tests
- Affected systems:
  - Supabase Auth integration, customer self-serve access, support burden
- No schema migration required.
- This is a customer-access and trust issue, not just a polish fix.

## Release Criteria

- A user can request a reset link, complete the flow, and set a new password without developer intervention.
- Invalid links and expired tokens fail safely and do not leak account information.
- The flow is covered by end-to-end or integration-level tests in the release suite.
