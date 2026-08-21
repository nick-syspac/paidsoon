# authenticated-frontend-performance Specification

## Purpose
Defines measurable production-mode performance behavior for authenticated frontend routes while preserving verified identity, authorization, and tenant isolation.
## Requirements
### Requirement: Comparable performance evidence

The system SHALL use the same documented production-mode method to capture available before-and-after measurements for initial response time, useful dashboard rendering, initial request count, transferred JavaScript, duplicate authenticated lookups, and production build characteristics. The record MUST identify unavailable measurements and MUST NOT substitute estimates for observations.

#### Scenario: Local production baseline without deployment telemetry

- **WHEN** the deployed URL, authenticated test account, or Vercel telemetry is unavailable
- **THEN** the implementation records measurements available from a local production build and explicitly marks deployment-only metrics as unavailable

#### Scenario: Before-and-after comparison

- **WHEN** a performance optimization is completed
- **THEN** the same measurement procedure is repeated and its observed result is compared with the baseline

### Requirement: Verified authentication remains authoritative

Authenticated route optimizations MUST preserve server-side verified user validation, token refresh, logout, MFA, session-expiry behavior, and existing authorization outcomes. Untrusted cookie or token decoding MUST NOT replace authoritative session validation.

#### Scenario: Expired session requests the dashboard

- **WHEN** a browser with an expired or invalid session requests an authenticated dashboard route
- **THEN** the request is denied or redirected according to the existing authentication contract before tenant data is rendered

#### Scenario: Valid session navigates within the dashboard

- **WHEN** a signed-in user navigates directly or client-side to a dashboard route
- **THEN** the route uses the verified user identity and preserves the existing visible result

### Requirement: Tenant-specific data is never shared across requests

Authenticated, user-specific, authorization-specific, and tenant-specific results MUST remain protected by the existing RLS and authorization boundaries. Such results MUST NOT be stored in a public or globally shared cache, and every cross-request cache key MUST include all relevant identity and authorization dimensions unless the data is genuinely public.

#### Scenario: Two tenants request equivalent dashboard routes

- **WHEN** two authenticated users request the same dashboard URL
- **THEN** each response contains only data permitted for that user's tenant context and neither response can reuse the other user's protected result

#### Scenario: Authenticated response caching is inspected

- **WHEN** dashboard response and data-cache behavior is verified
- **THEN** no tenant-specific response is publicly cacheable or reusable without a complete authorization-safe key

### Requirement: Request-scoped identity and tenant work is deduplicated

Within each application render phase, the system SHALL perform no avoidable duplicate verified-user, profile, tenant-context, membership, or permission lookup for the same inputs. Request-scoped reuse MUST end with the request and MUST NOT bypass a security phase that independently requires validation.

#### Scenario: Dashboard layout and page render together

- **WHEN** a dashboard layout and its page require the same verified identity or profile during one render
- **THEN** each equivalent application-render lookup is executed at most once and its request-scoped result is reused

#### Scenario: Proxy and application checks serve separate security phases

- **WHEN** both the request proxy and the application render require authoritative identity validation
- **THEN** any retained validation is documented as a distinct security boundary rather than reported as an avoidable duplicate

### Requirement: Dashboard work avoids unnecessary waterfalls

The system SHALL avoid serializing independent dashboard operations and SHALL avoid fetching data that is not required for the rendered view. Any intentionally sequential work MUST have a documented correctness, connection, or security constraint supported by repository evidence or measurement.

#### Scenario: Independent dashboard sections load

- **WHEN** one dashboard section can render without another section's result
- **THEN** the slower section does not unnecessarily block useful content when safe concurrency or streaming is supported

#### Scenario: Shared RLS transaction requires sequential queries

- **WHEN** concurrent operations on one transaction would violate adapter or connection constraints
- **THEN** the implementation preserves safe transaction behavior and reduces latency through query consolidation, reduced query count, or independently scoped work instead

### Requirement: Initial browser work is necessary and bounded

The authenticated frontend SHALL NOT issue an avoidable duplicate browser request for data already available during server rendering, and non-critical client code SHALL NOT be included in the initial bundle when evidence shows it can be deferred without changing visible behavior.

#### Scenario: Initial dashboard hydration completes

- **WHEN** the server-rendered dashboard hydrates in the browser
- **THEN** it does not refetch equivalent initial dashboard data solely because hydration completed

#### Scenario: Deferred interaction is activated

- **WHEN** a user activates a non-critical interaction whose code or data was deferred
- **THEN** the interaction loads and behaves as before with an explicit loading and error state where needed

### Requirement: Performance diagnostics protect sensitive data

Server timing and structured performance diagnostics SHALL identify request stages and durations without recording secrets, session tokens, user identifiers, client contact details, invoice values, or other tenant data. Production diagnostics MUST be bounded or configurable to avoid material latency and log-volume regressions.

#### Scenario: Dashboard timing is recorded

- **WHEN** performance diagnostics are enabled for a dashboard request
- **THEN** the output contains correlation-safe stage durations and excludes protected authentication and customer data

### Requirement: Deployment-dependent findings are actionable

The implementation SHALL document any material production checks that cannot be performed from the repository, including Vercel compute behavior and region, Supabase and database region, query performance, indexes, cold starts, function duration, and observability configuration.

#### Scenario: Region alignment cannot be verified locally

- **WHEN** repository configuration does not establish the deployed compute and database regions
- **THEN** the result identifies the exact dashboards and settings an operator must inspect without changing regions automatically

