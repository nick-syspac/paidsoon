# Spec Delta

## ADDED Requirements

### Requirement: Tenant subscription section SHALL show effective trial access
The tenant subscription section SHALL additionally show organisation label, primary billing contact and provenance, billing plan/status, Stripe trial end if available, admin grant plan/expiry, effective plan/access expiry and source. Only the elevated owner SHALL see management controls, including extension presets, explicit expiry, reason, optional notification defaulting off, and grant revocation.

#### Scenario: Tenant has a temporary grant
- **WHEN** the owner opens an eligible tenant with a valid grant
- **THEN** persisted billing state and effective granted access are displayed separately
- **AND** management explains that Stripe billing is unchanged
- **AND** date/time preview includes the admin timezone and offset

#### Scenario: Missing identity or trial data
- **WHEN** tenant display name, Stripe billing contact or a trial expiry is absent
- **THEN** the section uses labeled tenant/auth-contact fallbacks or explicit unavailable states rather than invented organisation or Stripe data

#### Scenario: Non-owner views tenant detail
- **WHEN** authorized elevated support/admin staff opens the existing tenant detail
- **THEN** the existing permitted health snapshot remains accessible
- **AND** trial-management controls and owner-only operation details are unavailable

#### Scenario: Paid or restricted subscription
- **WHEN** the owner opens a paid or billing-restricted tenant
- **THEN** grant/extension controls are disabled with a clear reason and billing-resolution guidance where needed
- **AND** revoking a retained admin grant remains available without implying paid access will end