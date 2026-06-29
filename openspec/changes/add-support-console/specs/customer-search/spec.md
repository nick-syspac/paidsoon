## ADDED Requirements

### Requirement: Support staff can search for customer accounts by email

The system SHALL provide a `/api/admin/customers/search?q=email` endpoint that accepts a customer email (partial match, case-insensitive) and returns a list of matching `UserProfile` records. The search response SHALL include: userId, email (from auth.users), displayName, subscriptionTier, subscriptionStatus, stripeCustomerId, createdAt, and lastSeenAt (derived from most recent audit event or session). The endpoint SHALL require `platform_admin` or `platform_support` role. Search queries SHALL be logged to `AdminAuditEvent` with action type `customer_search` and `query` parameter stored in details.

#### Scenario: Successful search returns matching customers
- **WHEN** a `platform_support` user queries `/api/admin/customers/search?q=sarah@`
- **THEN** the system returns all `UserProfile` records with emails starting with "sarah@" (up to 50 results)
- **AND** each result includes: userId, email, displayName, tier, status, created date
- **AND** an `AdminAuditEvent` is created with action `customer_search`

#### Scenario: Search with no results
- **WHEN** a `platform_support` user queries `/api/admin/customers/search?q=nonexistent@invalid.com`
- **THEN** the system returns an empty array
- **AND** an `AdminAuditEvent` is still created (for transparency)

#### Scenario: Unauthenticated user cannot search
- **WHEN** an unauthenticated user requests `/api/admin/customers/search`
- **THEN** the system returns 401 Unauthorized
- **AND** no `AdminAuditEvent` is created

#### Scenario: Customer profile page displays full summary
- **WHEN** support staff clicks a search result, they navigate to `/admin/customers/[userId]`
- **THEN** the system displays: full UserProfile data, all active invoices (count, overdue count), all impersonation sessions (history), subscription details, stripe connection status
- **AND** the page includes buttons: [Impersonate], [View Audit Log], [Admin Actions]

### Requirement: Search interface is available in admin dashboard

The system SHALL display a `/admin/customers` page accessible to `platform_admin` and `platform_support` roles. The page SHALL include: search input field (debounced, minimum 3 characters), results list, and optional filters (subscription tier, status, date range).

#### Scenario: Staff navigates to customer search page
- **WHEN** a `platform_admin` navigates to `/admin/customers`
- **THEN** the system displays the search interface with input field and recent support activity
- **AND** no results are shown until a search query is entered

#### Scenario: Results are paginated
- **WHEN** a search returns > 50 results
- **THEN** the system displays the first 50 with a "Load More" button
- **AND** pagination state is not tracked in URL (each load is a fresh query, audited separately)
