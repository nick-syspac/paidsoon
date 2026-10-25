# Spec Delta

## MODIFIED Requirements

### Requirement: Settings use a unified Connections destination
The system SHALL use `/settings/connections` as the canonical settings destination for all provider setup, including Stripe Connect and accounting integrations.

#### Scenario: User opens settings navigation
- **WHEN** an authenticated user opens settings
- **THEN** navigation shows a single "Connections" tab instead of separate "Stripe Connection" and "Integrations" tabs

#### Scenario: User visits legacy Stripe settings URL
- **WHEN** a user navigates to `/settings/stripe`
- **THEN** the system redirects to `/settings/connections` and preserves existing query parameters

#### Scenario: User visits legacy integrations settings URL
- **WHEN** a user navigates to `/settings/integrations`
- **THEN** the system redirects to `/settings/connections` and preserves existing query parameters

#### Scenario: OAuth callback returns with status query parameters
- **WHEN** Stripe, Xero, or MYOB callback routes redirect after connect/cancel/error
- **THEN** the user lands on `/settings/connections` and sees provider-appropriate feedback without cross-provider message collision
