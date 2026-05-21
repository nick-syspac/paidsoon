## ADDED Requirements

### Requirement: Free tier emails are sent from the system domain
On the Free tier, all follow-up emails SHALL be sent with `From: Invoice Nudge <billing@invoicenudge.com>` and `Reply-To` set to the freelancer's account email address.

#### Scenario: Free tier email from-address
- **WHEN** the cron job sends a follow-up email for a Free-tier user
- **THEN** the `From` header is `Invoice Nudge <billing@invoicenudge.com>` and `Reply-To` is the freelancer's registered email

---

### Requirement: Pro users can set a verified custom from-address
On the Pro tier, the system SHALL allow a freelancer to configure a custom `fromEmail` and `fromName`. The email address SHALL be verified via Resend's sender verification before it can be used. Until verified, the system SHALL fall back to the system domain email.

#### Scenario: Pro user adds a custom from-address
- **WHEN** a Pro user submits a from-address and from-name in email settings
- **THEN** the system sends a verification request to Resend and stores the address with `resendVerified: false`

#### Scenario: From-address successfully verified
- **WHEN** the user completes Resend's email verification flow
- **THEN** the system sets `resendVerified: true` and subsequent emails use the verified from-address

#### Scenario: Unverified address falls back to system domain
- **WHEN** the cron runs for a Pro user whose `fromEmail` has `resendVerified: false`
- **THEN** the email is sent from the system domain (`billing@invoicenudge.com`) with `Reply-To` set to the freelancer's email

#### Scenario: Free user cannot access custom from-address settings
- **WHEN** a Free-tier user navigates to email settings
- **THEN** the custom from-address field is disabled with an upgrade prompt

---

### Requirement: One custom from-address per account
The system SHALL support exactly one verified from-address per user account at MVP. If a user submits a new from-address, it replaces the previous one and requires re-verification.

#### Scenario: User replaces existing from-address
- **WHEN** a Pro user submits a new from-address that differs from their existing one
- **THEN** `resendVerified` is set to `false`, the new address replaces the old one, and a new verification request is sent to Resend
