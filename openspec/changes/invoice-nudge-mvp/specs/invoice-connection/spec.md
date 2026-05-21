## ADDED Requirements

### Requirement: Freelancer can connect a Stripe account
The system SHALL allow a freelancer to connect their Stripe account via Stripe Connect OAuth. Upon successful connection, an `invoice_connections` record SHALL be created with `provider: 'stripe'` and the connected account ID stored encrypted.

#### Scenario: Successful Stripe Connect OAuth
- **WHEN** a user clicks "Connect Stripe" and completes the Stripe OAuth flow
- **THEN** the system stores the connected account ID in `invoice_connections` with `isActive: true` and redirects to the dashboard with a success message

#### Scenario: User already has a connected Stripe account
- **WHEN** a user who already has an active Stripe connection attempts to connect again
- **THEN** the system SHALL update the existing connection rather than creating a duplicate

#### Scenario: OAuth flow cancelled
- **WHEN** a user cancels the Stripe Connect OAuth flow before completion
- **THEN** no connection record is created and the user is returned to the dashboard with no changes

---

### Requirement: Freelancer can disconnect their Stripe account
The system SHALL allow a freelancer to disconnect their Stripe account. Upon disconnection, the `invoice_connections` record SHALL be marked `isActive: false` and all pending tracked invoices for that connection SHALL be set to `paused`.

#### Scenario: Disconnect Stripe account
- **WHEN** a user confirms disconnection of their Stripe account
- **THEN** the connection is deactivated, pending invoice sequences are paused, and the user sees a confirmation message

---

### Requirement: Provider abstraction layer is used for all invoice source interactions
The system SHALL route all invoice source interactions through a provider interface (`InvoiceProvider`). Direct Stripe API calls SHALL NOT appear in application business logic — only in the `StripeInvoiceProvider` adapter.

#### Scenario: Invoice provider selected at runtime
- **WHEN** the system processes a tracked invoice with `provider: 'stripe'`
- **THEN** it SHALL use the `StripeInvoiceProvider` adapter to fetch invoice details and verify webhook signatures

---

### Requirement: Webhook endpoint receives Stripe Connect events
The system SHALL expose a `/api/webhooks/stripe-connect` endpoint that receives and verifies Stripe Connect webhook events using the connected account's signing secret.

#### Scenario: Valid webhook received
- **WHEN** Stripe sends a valid signed webhook event to `/api/webhooks/stripe-connect`
- **THEN** the system processes the event and returns HTTP 200

#### Scenario: Invalid webhook signature
- **WHEN** a request arrives at `/api/webhooks/stripe-connect` with an invalid or missing signature
- **THEN** the system SHALL return HTTP 400 and SHALL NOT process the payload
