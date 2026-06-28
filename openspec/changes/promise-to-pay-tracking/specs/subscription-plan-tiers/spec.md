## MODIFIED Requirements

### Requirement: Tier-specific branding, sender identity, and AI capabilities

The system SHALL gate branding, sender identity, tone settings, AI rewrite, and promise-to-pay tracking by tier as follows: Starter includes Paid Soon branding and excludes AI customisation, custom email sender, and promise-to-pay tracking; Business allows use of the account's own email address, includes customer tone settings (friendly, firm, final notice), basic AI rewrite of reminder messages, and promise-to-pay tracking; Accountant Partner includes all Business capabilities plus promise-to-pay tracking.

#### Scenario: User attempts to use unavailable premium capability

- **WHEN** a user attempts to use a feature not included in the active tier (such as AI rewrite on Starter or promise-to-pay tracking on Starter)
- **THEN** the system blocks the action and presents an upgrade path

#### Scenario: Business user email includes promise-to-pay link

- **WHEN** a follow-up email is sent on behalf of a Business-tier or Accountant Partner-tier user
- **THEN** the email includes a promise-to-pay link because `promise_to_pay_tracking` is enabled for those tiers
