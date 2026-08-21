# diagnostic-tracing Specification

## Purpose
TBD - created by archiving change add-diagnostic-tracing. Update Purpose after archive.
## Requirements
### Requirement: Debug configuration is disabled by default
The system SHALL treat diagnostic tracing as disabled unless the server-side `DEBUG` environment variable is explicitly set to `true`, compared case-insensitively after trimming whitespace.

#### Scenario: DEBUG is unset
- **WHEN** the application starts or handles a traced operation with `DEBUG` unset
- **THEN** diagnostic tracing is disabled
- **AND** normal application behaviour and existing logging remain unchanged

#### Scenario: DEBUG is false
- **WHEN** `DEBUG=false`
- **THEN** diagnostic tracing is disabled

#### Scenario: DEBUG is true with mixed case
- **WHEN** `DEBUG=TrUe`
- **THEN** diagnostic tracing is enabled

#### Scenario: DEBUG has an unexpected value
- **WHEN** `DEBUG` is empty, malformed, or set to any value other than case-insensitive `true`
- **THEN** diagnostic tracing is disabled

### Requirement: Server-only debug control
The system SHALL keep `DEBUG` as server-only configuration and MUST NOT expose it directly through a `NEXT_PUBLIC_*` environment variable or client-readable secret.

#### Scenario: Browser tracing is needed
- **WHEN** browser-side trace markers are required for login submission, navigation, or display completion
- **THEN** the browser receives only a non-secret server-mediated debug signal or trace identifier
- **AND** the browser cannot read server-only environment variables or sensitive configuration

### Requirement: Structured trace event format
When diagnostic tracing is enabled, the system SHALL emit structured trace events with consistent fields for operation identity, origin, timing, outcome, correlation, HTTP metadata, auth/session summaries, navigation decisions, safe context, and errors where applicable.

#### Scenario: Operation completes successfully
- **WHEN** a traced operation starts and completes successfully
- **THEN** the trace events identify the operation, subsystem, component, stage, trace ID, start event, success event, and duration

#### Scenario: HTTP route is traced
- **WHEN** a traced operation occurs in a route handler or proxy request
- **THEN** the trace event includes the HTTP method and route
- **AND** completion events include the HTTP response status where available

#### Scenario: Operation fails
- **WHEN** a traced operation fails
- **THEN** the trace event identifies the failing stage, failure status, duration, and safe error details

### Requirement: Login-to-dashboard trace coverage
When diagnostic tracing is enabled, the system SHALL trace the implemented login-to-dashboard journey from sign-in initiation through initial dashboard display.

#### Scenario: Email login succeeds
- **WHEN** a user successfully signs in with email and password and reaches the dashboard
- **THEN** related trace events cover login form submission, `/api/auth/sign-in` request initiation, request validation, Supabase password sign-in, auth response outcome, session cookie handling summary, client navigation to `/dashboard`, dashboard auth checks, dashboard data loading, render decision, and initial dashboard display completion

#### Scenario: OAuth login succeeds
- **WHEN** a user successfully signs in through Google OAuth and reaches dashboard or onboarding
- **THEN** trace events cover OAuth initiation, auth callback handling, code exchange outcome, profile bootstrap, redirect decision, proxy/dashboard auth checks where applicable, and dashboard or onboarding navigation outcome

#### Scenario: Stage is not implemented in current architecture
- **WHEN** a requested trace stage has no corresponding current code path, such as organisation membership loading in the main dashboard path
- **THEN** the trace records the nearest actual context resolution stage without inventing a middleware or service that does not exist

### Requirement: Correlation ID links related events
The system SHALL attach a non-secret correlation or trace ID to related diagnostic events across the login-to-dashboard journey where technically feasible.

#### Scenario: Email login navigates to dashboard
- **WHEN** the sign-in route creates or receives a trace ID and the browser navigates to `/dashboard`
- **THEN** route, proxy, dashboard layout, dashboard page, and initial display trace events share a usable correlation ID

#### Scenario: Existing trace ID is unavailable
- **WHEN** an OAuth callback or dashboard request has no prior trace ID
- **THEN** the system creates a new non-secret trace ID
- **AND** subsequent events in that request flow use the new trace ID

### Requirement: Central redaction protects sensitive data
The system SHALL apply central redaction before emitting trace events and MUST redact sensitive values at any nesting depth.

#### Scenario: Sensitive login fields are traced
- **WHEN** sign-in input context is included in a trace event
- **THEN** passwords, Turnstile tokens, access tokens, refresh tokens, session cookies, authorization headers, API keys, database credentials, Supabase secret keys, and complete auth responses are omitted or replaced with redacted markers

#### Scenario: Nested sensitive values are present
- **WHEN** a nested object, array, error cause, request config, or third-party response contains sensitive field names or headers
- **THEN** the redactor removes or masks those sensitive values before logging

#### Scenario: Long payload is traced
- **WHEN** a value or payload exceeds the configured maximum length
- **THEN** the trace event includes only a truncated safe representation

### Requirement: Auth and session objects use safe summaries
The system SHALL log authentication and session state transitions using safe summaries rather than raw auth/session objects.

#### Scenario: Supabase returns a session
- **WHEN** Supabase Auth returns or refreshes a session
- **THEN** trace events indicate safe state such as user presence, provider where safe, expiry presence, and session/cookie write occurrence
- **AND** trace events do not include access tokens, refresh tokens, session cookies, or full auth response bodies

### Requirement: User-facing errors remain safe
Diagnostic tracing SHALL improve protected logs without exposing stack traces, internal implementation details, or debug payloads to ordinary users.

#### Scenario: Invalid login fails
- **WHEN** email/password authentication fails while debug tracing is enabled
- **THEN** protected logs include the failing stage and safe internal error summary
- **AND** the user receives the existing safe invalid-credentials response

#### Scenario: Dashboard loading fails
- **WHEN** dashboard data loading fails while debug tracing is enabled
- **THEN** protected logs identify the failing dashboard stage and safe underlying error details
- **AND** the browser UI does not display stack traces or internal debug details

### Requirement: Tracing does not change security controls
Diagnostic tracing MUST NOT alter authentication, authorisation, tenant isolation, RLS, CSRF protection, Turnstile verification, subscription feature gates, or redirect rules.

#### Scenario: Dashboard request is unauthenticated
- **WHEN** an unauthenticated request reaches `/dashboard` while debug tracing is enabled
- **THEN** the existing redirect to `/sign-in` still occurs
- **AND** trace events record only safe redirect and auth-presence information

#### Scenario: User-scoped data loads
- **WHEN** dashboard data is loaded while debug tracing is enabled
- **THEN** user-scoped Prisma queries still execute through `withUserContext()` under RLS

### Requirement: Tracing failures are non-fatal
The system SHALL ensure logging, redaction, formatting, or trace emission failures do not interrupt login, callback, proxy, or dashboard rendering flows.

#### Scenario: Log sink throws
- **WHEN** the trace sink or formatter fails during a traced operation
- **THEN** the application continues the original operation without changing its user-visible result

### Requirement: Disabled tracing has negligible overhead
When diagnostic tracing is disabled, the system SHALL avoid constructing large debug payloads and SHALL add only negligible overhead to traced code paths.

#### Scenario: DEBUG is false during dashboard render
- **WHEN** the dashboard loads with debug tracing disabled
- **THEN** trace helpers return without serialising invoice data, auth responses, request bodies, or error chains for diagnostic output

### Requirement: Environment documentation explains operation
The system SHALL document how to enable, disable, verify, retain, access, and remove debug trace logs in local, preview, staging, and production environments.

#### Scenario: Operator enables debug in local development
- **WHEN** an operator sets `DEBUG=true` locally
- **THEN** documentation explains that the development server must be restarted before the setting is reliable

#### Scenario: Operator enables debug in production
- **WHEN** `DEBUG=true` is enabled in production
- **THEN** documentation requires time-boxed use, protected log access, a prominent warning, and rollback by setting `DEBUG=false` or removing the variable followed by redeploy or restart as needed

### Requirement: Tests verify tracing and redaction
The system SHALL include automated tests for debug configuration, positive trace emission, mandatory redaction, safe error summaries, disabled no-op behaviour, and preservation of login/dashboard behaviour.

#### Scenario: Redaction test covers protected values
- **WHEN** tests pass nested objects containing passwords, tokens, cookies, credentials, authorization headers, and API keys through the tracing redactor
- **THEN** emitted trace output contains none of the protected raw values

#### Scenario: Enabled tracing test covers login failure
- **WHEN** `/api/auth/sign-in` fails authentication with debug tracing enabled in tests
- **THEN** trace output includes the failing stage and correlation ID
- **AND** trace output does not include password or Turnstile token values

