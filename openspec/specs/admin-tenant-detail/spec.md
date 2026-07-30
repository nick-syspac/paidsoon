# admin-tenant-detail Specification

## Purpose
TBD - created by archiving change admin-support-diagnostics. Update Purpose after archive.
## Requirements
### Requirement: Tenant list is searchable
The admin tenants list page SHALL provide a search input that filters results by `UserProfile.displayName` (case-insensitive, partial match). The search query SHALL be submitted as a `?search=` URL parameter so the result is bookmarkable and shareable. The list SHALL continue to show the most recent 50 results when no search query is present.

#### Scenario: Name search returns matching tenants
- **WHEN** an admin enters a partial display name in the search field and submits
- **THEN** the page reloads with `?search=<query>` and shows only tenants whose `displayName` contains the query (case-insensitive)

#### Scenario: Empty search shows default list
- **WHEN** an admin clears the search field and submits
- **THEN** the page shows the most recent 50 tenants ordered by `createdAt` descending

#### Scenario: Search with no results shows empty state
- **WHEN** an admin searches for a string that matches no tenant
- **THEN** the page shows a "No tenants found" empty state message rather than a blank table

---

### Requirement: Users page is removed in favour of unified tenant list
The `/admin/users` route SHALL be removed. Any links to `/admin/users` in the admin navigation SHALL point to `/admin/tenants` instead.

#### Scenario: Old users route redirects
- **WHEN** an admin navigates to `/admin/users`
- **THEN** they are redirected to `/admin/tenants`

---

### Requirement: Tenant detail view shows full health snapshot
Navigating to `/admin/tenants/[userId]` SHALL render a server-rendered page containing all of the following sections for that user:
1. **Identity**: display name, email address (from Supabase auth), user ID, account created date.
2. **Subscription**: plan tier, subscription status, trial end date (if applicable), Stripe customer ID with external link to Stripe dashboard.
3. **Connections**: Stripe Connect status (connected/disconnected); each accounting connection (provider, org name, status, last synced date).
4. **Schedule**: the three follow-up day offsets configured by the user.
5. **Invoice summary**: count of tracked invoices grouped by state (open, paused, snoozed, resolved, sequence_complete).
6. **Recent email log**: the last 30 days of `EmailLog` rows for this user, showing stage, sent date, subject, and send result. `clientEmail` SHALL NOT be shown.
7. **Email settings**: custom From address (if set), `resendVerified` flag, reply-to address.

#### Scenario: Detail page renders for a user with all data
- **WHEN** an admin navigates to `/admin/tenants/[userId]` for a user who has a profile, schedule, email settings, connections, invoices, and email logs
- **THEN** all seven sections are rendered with correct data

#### Scenario: Detail page renders gracefully for a new user with minimal data
- **WHEN** an admin navigates to `/admin/tenants/[userId]` for a user who has only a profile (no schedule, no connections, no invoices)
- **THEN** the page renders with empty states for missing sections rather than throwing an error

#### Scenario: Navigating to a non-existent userId returns 404
- **WHEN** an admin navigates to `/admin/tenants/[userId]` with a userId that has no corresponding `UserProfile`
- **THEN** a 404 page is rendered

