## Purpose

Define deterministic server-side guardrails for AI rewrite usage so PaidSoon can prevent abusive or accidental overuse while keeping cost exposure predictable per account tier.

## ADDED Requirements

### Requirement: Enforce monthly AI rewrite quota per tier
The system SHALL enforce a monthly AI rewrite quota per user tier for successful `POST /api/settings/ai` requests. The quota SHALL be evaluated before invoking the AI provider, using previously recorded successful usage entries.

#### Scenario: Request allowed below monthly quota
- **WHEN** an authenticated user submits a valid rewrite request and their successful rewrite count in the active quota window is below their tier quota
- **THEN** the request proceeds to AI generation

#### Scenario: Request blocked at monthly quota
- **WHEN** an authenticated user submits a valid rewrite request and their successful rewrite count in the active quota window is equal to or greater than their tier quota
- **THEN** the route returns a limit error without invoking the AI provider

### Requirement: Enforce rolling hourly cap
The system SHALL enforce a rolling per-user hourly cap for successful AI rewrite requests.

#### Scenario: Request blocked at hourly cap
- **WHEN** a user has reached or exceeded the configured successful rewrite count in the prior 60 minutes
- **THEN** the route returns a limit error without invoking the AI provider

### Requirement: Enforce rolling burst cap
The system SHALL enforce a short rolling burst cap per user to reduce scripted rapid-fire usage.

#### Scenario: Request blocked at burst cap
- **WHEN** a user has reached or exceeded the configured successful rewrite count in the prior 60 seconds
- **THEN** the route returns a limit error without invoking the AI provider

### Requirement: Derive remaining credits from usage logs
The system SHALL derive remaining monthly AI credits as `monthlyQuota - successfulUsageCountInWindow`, floored at zero.

#### Scenario: Remaining credits returned after successful rewrite
- **WHEN** a rewrite request succeeds
- **THEN** the response includes the user's remaining monthly credits for the active quota window

#### Scenario: Remaining credits returned on limit error
- **WHEN** a rewrite request is rejected due to usage limits
- **THEN** the response includes remaining monthly credits (zero at quota exhaustion)

### Requirement: Count only successful rewrites toward limits
Only successful AI rewrite requests SHALL consume quota or rate-limit counts.

#### Scenario: Failed rewrite does not consume quota
- **WHEN** the AI provider call fails and the route returns a non-200 response
- **THEN** no additional usage entry is counted toward monthly, hourly, or burst limits

#### Scenario: Entitlement or validation rejection does not consume quota
- **WHEN** a request is rejected before AI generation due to entitlement or input validation failure
- **THEN** no usage entry is counted toward monthly, hourly, or burst limits
