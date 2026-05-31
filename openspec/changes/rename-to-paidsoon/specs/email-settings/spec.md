## MODIFIED Requirements

### Requirement: Free tier emails are sent from the system domain
On the Free tier, all follow-up emails SHALL be sent with `From: PaidSoon <billing@paidsoon.com>` and `Reply-To` set to the freelancer's account email address.

#### Scenario: Free tier email from-address
- **WHEN** the cron job sends a follow-up email for a Free-tier user
- **THEN** the `From` header is `PaidSoon <billing@paidsoon.com>` and `Reply-To` is the freelancer's registered email

---

### Requirement: Unverified Pro from-address falls back to system domain
On the Pro tier, when a user has configured a custom `fromEmail` that has not yet been verified by Resend (`resendVerified: false`), the system SHALL fall back to the system-domain From address.

#### Scenario: Unverified address falls back to system domain
- **WHEN** the cron runs for a Pro user whose `fromEmail` has `resendVerified: false`
- **THEN** the email is sent from the system domain (`billing@paidsoon.com`) with `Reply-To` set to the freelancer's email
