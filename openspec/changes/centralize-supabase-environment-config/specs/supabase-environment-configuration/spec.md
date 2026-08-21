## Purpose

Defines one secure contract for deriving and validating PaidSoon's public Supabase URL and server-only PostgreSQL connection URLs across application, tooling, and worker runtimes.

## ADDED Requirements

### Requirement: Canonical Supabase inputs
The system SHALL treat `SUPABASE_PROJECT_REF` and `SUPABASE_DB_PASSWORD` as the canonical project identity and database credential. It SHALL validate the project reference before use and SHALL reject whitespace, URL delimiters, uppercase characters, and values outside the Supabase project-reference format. The password SHALL remain server-only.

#### Scenario: Valid canonical inputs
- **WHEN** a supported startup path receives a valid lowercase Supabase project reference and a database password
- **THEN** it derives configuration from those canonical inputs without requiring preconstructed Supabase or PostgreSQL URLs

#### Scenario: Missing project reference
- **WHEN** a path requiring Supabase configuration starts without `SUPABASE_PROJECT_REF`
- **THEN** it fails before starting the consumer with a clear error naming the missing variable and no credential value

#### Scenario: Malformed project reference
- **WHEN** `SUPABASE_PROJECT_REF` contains whitespace, uppercase characters, URL syntax, or an invalid length
- **THEN** configuration fails before constructing any URL and reports only that the project reference is malformed

### Requirement: Deterministic public URL derivation
The system SHALL derive `NEXT_PUBLIC_SUPABASE_URL` as `https://${SUPABASE_PROJECT_REF}.supabase.co` and SHALL validate the resulting URL. Public-only derivation SHALL NOT read or require `SUPABASE_DB_PASSWORD`.

#### Scenario: Public URL construction
- **WHEN** `SUPABASE_PROJECT_REF` is valid
- **THEN** the public URL uses HTTPS, the project reference as the sole leftmost hostname label, and the `supabase.co` domain with no path, query, credentials, or fragment

#### Scenario: Browser-only configuration
- **WHEN** a client-only build or pure browser-facing test needs Supabase public configuration
- **THEN** it can derive or receive `NEXT_PUBLIC_SUPABASE_URL` without access to the database password or either database URL

### Requirement: Safe database URL derivation
For database-required paths, the system SHALL percent-encode the complete database password as UTF-8 URI user-info data before interpolation. It SHALL derive `DATABASE_URL` as `postgresql://postgres.${SUPABASE_PROJECT_REF}:<encoded-password>@<pooler-host>:6543/postgres?pgbouncer=true&connection_limit=1` and `DIRECT_URL` as `postgresql://postgres.${SUPABASE_PROJECT_REF}:<encoded-password>@<pooler-host>:5432/postgres`.

The default pooler host SHALL be `aws-1-ap-southeast-2.pooler.supabase.com`. A deployment in another Supabase topology SHALL be able to provide a validated, non-secret pooler hostname without changing URL-construction code.

#### Scenario: Pooled runtime URL
- **WHEN** valid canonical inputs use the default topology
- **THEN** `DATABASE_URL` uses the `postgres.<project-ref>` user, the default pooler host, port `6543`, database `postgres`, and exactly the required `pgbouncer=true` and `connection_limit=1` query parameters

#### Scenario: Migration URL
- **WHEN** valid canonical inputs use the default topology
- **THEN** `DIRECT_URL` uses the `postgres.<project-ref>` user, the default pooler host, port `5432`, database `postgres`, and no runtime-only query parameters

#### Scenario: Reserved characters in password
- **WHEN** the database password contains `@`, `:`, `/`, `?`, `#`, `%`, `&`, non-ASCII text, or another character unsafe in URI user-info
- **THEN** parsing either derived PostgreSQL URL recovers the original password and does not alter host, port, database, or query parameters

#### Scenario: Missing database password
- **WHEN** a runtime, migration, seed, reset, or integration path requires database access without `SUPABASE_DB_PASSWORD`
- **THEN** it fails before opening a connection and reports only that the canonical password variable is missing

#### Scenario: Invalid topology override
- **WHEN** a pooler-host override includes a scheme, port, credentials, path, query, fragment, whitespace, or a non-Supabase pooler domain
- **THEN** configuration fails without constructing or exposing a connection string

### Requirement: Configuration exists before each consumer starts
Every database consumer SHALL derive configuration before its first connection. Next.js compilation SHALL receive the public URL before client bundling; server runtime modules SHALL obtain database configuration through a server-only boundary; Prisma configuration SHALL resolve migration configuration before Prisma CLI actions; Node operational scripts SHALL materialise required derived values after safe env loading; and the Python worker SHALL validate equivalent configuration before a database-using process starts.

#### Scenario: Prisma generation without database credentials
- **WHEN** Prisma client generation runs in an explicit generate-only mode
- **THEN** generation succeeds without `SUPABASE_DB_PASSWORD` and without attempting a database connection

#### Scenario: Prisma migration
- **WHEN** a Prisma migration command runs with valid canonical database inputs
- **THEN** Prisma receives the derived port-5432 migration URL before evaluating its datasource and does not require an externally materialised `DIRECT_URL`

#### Scenario: Seed and RLS commands
- **WHEN** a supported seed, reset, verification, or `psql` RLS command starts with valid canonical database inputs
- **THEN** its child process receives only the derived URLs required for that command before execution

#### Scenario: Next.js server runtime
- **WHEN** a Vercel server function initializes a Prisma or server-side Supabase consumer
- **THEN** server-only configuration is derived in-process without depending on an `npm start` wrapper or platform interpolation

#### Scenario: Railway worker startup
- **WHEN** any Celery worker, Celery Beat, or worker web service starts with valid canonical database inputs
- **THEN** the Python runtime derives and validates its database URL before a database operation and does not require Railway to interpolate a preconstructed URL

### Requirement: Legacy configuration conflict handling
During migration, an externally supplied `NEXT_PUBLIC_SUPABASE_URL`, `DATABASE_URL`, or `DIRECT_URL` SHALL never override canonical derivation. A supplied legacy value MAY be accepted only when it exactly equals the corresponding derived value; any mismatch SHALL stop startup without showing either value. Deployments SHALL remove all three externally materialised values after verification.

#### Scenario: Matching transitional value
- **WHEN** canonical inputs and a matching legacy preconstructed value are both supplied during rollout
- **THEN** the canonical derivation remains authoritative and any deprecation notice identifies only the variable name

#### Scenario: Conflicting transitional value
- **WHEN** a supplied legacy value differs from its canonical derivation
- **THEN** startup fails before a consumer starts and the error contains neither the supplied nor derived value

#### Scenario: Canonical-only steady state
- **WHEN** migration is complete
- **THEN** local, CI, preview, staging, production, and worker environments operate without externally stored `NEXT_PUBLIC_SUPABASE_URL`, `DATABASE_URL`, or `DIRECT_URL`

### Requirement: Secret isolation and non-disclosure
`SUPABASE_DB_PASSWORD`, `DATABASE_URL`, and `DIRECT_URL` SHALL remain server-only and SHALL NOT appear in client bundles, public environment objects, API responses, diagnostic payloads, logs, errors, command output, test snapshots, or committed/generated artifacts. `NEXT_PUBLIC_SUPABASE_URL` MAY be included in client bundles.

#### Scenario: Client bundle inspection
- **WHEN** production client artifacts are scanned after a build
- **THEN** they contain neither secret variable names used for runtime access nor database credentials or PostgreSQL connection strings

#### Scenario: Validation failure redaction
- **WHEN** derivation, conflict checking, URL validation, or child-process startup fails
- **THEN** logs and errors contain a stable non-secret error code and relevant variable name but no secret value or connection string

#### Scenario: Diagnostic request
- **WHEN** a diagnostic endpoint or tracing helper reports environment readiness
- **THEN** it reports presence or a non-secret status only and never serialises a canonical password or derived database URL

### Requirement: Rotation and repository drift verification
After migration, rotating a Supabase database password SHALL require changing only `SUPABASE_DB_PASSWORD` in each environment's secret store and restarting or redeploying its consumers. Repository verification SHALL reject obsolete hard-coded Supabase project URLs and duplicated PostgreSQL connection templates except approved placeholders, test vectors, historical OpenSpec artifacts, and explicitly documented examples.

#### Scenario: Password rotation
- **WHEN** an operator updates only `SUPABASE_DB_PASSWORD` and restarts an environment
- **THEN** all database-required consumers use URLs derived from the new encoded password while the public Supabase URL remains unchanged

#### Scenario: Repository verification
- **WHEN** the environment drift check runs in CI
- **THEN** it fails on unapproved materialised Supabase project URLs or connection-string construction outside the authoritative configuration locations and reports file locations without printing matched credentials

#### Scenario: Supported environment smoke checks
- **WHEN** local, CI, preview, staging, production, and Railway startup checks are executed according to the rollout matrix
- **THEN** each required Next.js, Prisma, seed, migration, and worker path either starts successfully with canonical inputs or fails before connection with the specified redacted validation error