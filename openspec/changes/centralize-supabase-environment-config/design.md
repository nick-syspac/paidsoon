## Context

See `proposal.md` for motivation and `specs/supabase-environment-configuration/spec.md` for the behavioral contract.

### Confirmed current state

- `.env.example`, `.env.local.example`, `.env.preview.example`, and `.env.production.example` repeat a public project URL, pooled runtime URL, and direct migration URL. `worker/.env.example` repeats a pooler URL without Prisma query parameters.
- `lib/supabase/client.ts`, `lib/supabase/server.ts`, `proxy.ts`, and several server-only email/cron paths read `NEXT_PUBLIC_SUPABASE_URL` directly. `lib/db/admin.ts` reads `DATABASE_URL` directly.
- `prisma.config.ts` runs before application code, loads `.env.local` and `.env`, and selects `DIRECT_URL` with a `DATABASE_URL` fallback. `prisma/schema.prisma` is URL-free and `lib/generated/prisma/` is generated output.
- `package.json` runs `prisma generate && next build`. `.github/workflows/test.yml` currently injects placeholder `DATABASE_URL` and `DIRECT_URL` values because generation does not connect.
- Node operational scripts load `.env.local` through `scripts/_loadEnv.ts`; seed/reset/verification commands then read preconstructed URLs. Shell and runbook examples invoke `psql "$DIRECT_URL"` directly.
- `worker/paidsoon_worker/config.py` reads a preconstructed `DATABASE_URL`; `worker/paidsoon_worker/db.py` strips Prisma-only query parameters before psycopg. `worker/railway.toml` documents three dashboard-managed start commands and contains no secret values.
- Current docs describe `DATABASE_URL` on a Supavisor transaction pooler and `DIRECT_URL` on `db.<ref>.supabase.co:5432`. The requested target moves `DIRECT_URL` to the session-pooler hostname on port `5432` with user `postgres.<ref>`.
- No Django settings, Dockerfile, Compose file, or checked-in Railway environment definition was found. Vercel and Railway dashboard values cannot be inspected from this repository, so their current values and interpolation behavior are deliberately not assumed.
- Real ignored `.env*` files, `.next/`, `node_modules/`, `worker/.venv/`, and generated Prisma files are sensitive or generated and are not implementation targets.

The hard constraint is startup timing: browser constants are inlined during Next compilation, Prisma CLI evaluates `prisma.config.ts` before app modules, Vercel server functions do not pass through `npm start`, Node scripts expect `process.env`, and the Railway worker is Python. No single platform interpolation feature can cover these paths.

## Goals / Non-Goals

**Goals:**

- Make two canonical credential inputs sufficient for every Supabase consumer and make password rotation a one-secret operation per environment.
- Keep URL construction pure, deterministic, validated, and directly unit-testable.
- Use one checked-in topology contract and shared golden vectors across Node and Python adapters.
- Give each startup path configuration before it needs it without making client-only paths read server secrets.
- Preserve exact Prisma query parameters and worker psycopg compatibility.
- Make migration, rollback, and platform cutover observable without exposing values.

**Non-Goals:**

- Provision or move Supabase projects, rotate a real password during implementation, or alter Auth/API keys.
- Change Prisma models, migrations, RLS policies, database roles, or tenant-isolation behavior.
- Build a general-purpose environment framework for unrelated services.
- Commit real environment files, generated clients/build output, or platform-exported secrets.
- Assume all Supabase projects use the Australian pooler host; the requested host is the default, not an invariant.

## Decisions

### 1. Use a pure contract plus thin startup adapters

Create a side-effect-free TypeScript constructor that accepts explicit input values and returns typed public/database configuration. Keep environment reads and `process.env` mutation in adapters. Store non-secret topology defaults and shared golden test vectors in a small checked-in configuration area so the Python adapter can follow the same contract.

The public constructor accepts only the project reference. The server constructor additionally accepts the password and topology. A server-only entry point owns environment reads and conflict checks. Client modules continue to consume only the compile-time `NEXT_PUBLIC_SUPABASE_URL`; they never import the server entry point.

The Python worker uses `urllib.parse.quote(password, safe="")` and the shared topology/vectors in a single worker configuration adapter. Cross-runtime contract tests run the same vectors through both implementations. This is a deliberate small duplication at the language boundary; requiring Node in the Python Railway image or Python in Vercel would add a runtime dependency and a larger failure surface.

Alternatives rejected:

- Environment values containing `$SUPABASE_PROJECT_REF`: interpolation and percent-encoding are not portable across the target platforms.
- A server-only TypeScript module alone: it cannot run before Prisma CLI or inside the Python worker.
- A shell URL builder: robust UTF-8/user-info encoding and cross-shell behavior are harder to validate than standard URL APIs.
- Keeping platform-materialised database URLs: password rotation would still require multiple secret edits.

### 2. Treat pooler topology as non-secret validated configuration

Default the host to `aws-1-ap-southeast-2.pooler.supabase.com`, use `postgres.<ref>` for both URLs, and vary only the port and required runtime query. Permit an optional `SUPABASE_DB_POOLER_HOST` override restricted to a bare `*.pooler.supabase.com` hostname. It is topology, not a credential, and does not weaken the two canonical credential inputs.

This avoids hard-coding an Australian regional dependency for future projects while producing the exact requested values by default. Before rollout, operators must copy the session/transaction pooler hostname shown by each Supabase project's Connect panel and confirm that port `5432` is supported. This repository cannot confirm dashboard-specific project topology.

Alternative rejected: derive the AWS host from the project reference. Supabase project refs do not encode region or pooler cluster, so that derivation would be fictional.

### 3. Integrate at each earliest reliable lifecycle point

- `next.config.ts` loads only public configuration and materialises `NEXT_PUBLIC_SUPABASE_URL` before Next compiles client references. Full server modules derive database configuration lazily through a server-only adapter, which works in Vercel functions without an `npm start` wrapper.
- `prisma.config.ts` loads safe env files, calls the server constructor for migration commands, and passes the returned `directUrl` directly to Prisma. An explicit generate-only mode supplies a fixed non-secret localhost placeholder because `prisma generate` needs a syntactically valid datasource but does not connect.
- `scripts/_loadEnv.ts` remains the common Node operational prelude and materialises derived values after dotenv loading. A command wrapper supplies derived `DIRECT_URL` to child tools such as `psql` without printing the child environment.
- `lib/db/admin.ts` and other server database factories consume the server adapter's returned URL rather than raw `process.env.DATABASE_URL`.
- `worker/paidsoon_worker/config.py` derives its pooler URL before a database-using worker process starts. `db.py` may retain defensive query stripping so sharing the canonical pooled shape cannot break psycopg.
- Package scripts and documented Railway commands are updated so all supported dev/build/start/migrate/seed/reset/verify/worker entry points select the proper mode.

Alternative rejected: populate all three values unconditionally at import time. That would make linting, unit tests, client-only work, and Prisma generation require a database password unnecessarily.

### 4. Encode first, then construct and structurally validate

Validate `SUPABASE_PROJECT_REF` against the Supabase lowercase 20-character reference shape before use. Encode every UTF-8 password byte for URI user-info, with no reserved characters marked safe. Construct URLs from fixed components, then parse and assert protocol, username, hostname, port, pathname, query parameters, and absence of unexpected components.

Errors use stable codes such as `SUPABASE_PROJECT_REF_MISSING`, `SUPABASE_PROJECT_REF_INVALID`, `SUPABASE_DB_PASSWORD_MISSING`, `SUPABASE_POOLER_HOST_INVALID`, and `SUPABASE_LEGACY_CONFLICT`. Error messages can name variables and expected component classes but never include inputs or derived URLs.

Alternative rejected: interpolate the raw password and validate afterward. Delimiter characters may already have changed URL structure, making both validation and redaction less reliable.

### 5. Make canonical values authoritative during a staged cutover

Adapters record which legacy variables existed before derivation. A pre-existing value is compared in constant-shape application logic with the derived value. Matching values are overwritten by the canonical result and may produce a value-free deprecation warning; mismatches fail with `SUPABASE_LEGACY_CONFLICT`. No legacy value can win.

Once every environment is verified, remove `NEXT_PUBLIC_SUPABASE_URL`, `DATABASE_URL`, and `DIRECT_URL` from local templates and platform settings. Keep conflict detection as a guard against accidental reintroduction until a later cleanup change explicitly removes transitional support.

Alternative rejected: immediate unconditional rejection. Equality-checked coexistence permits a deploy-first/config-second rollout without accepting ambiguous configuration.

### 6. Verify security and operational behavior at multiple levels

- Node unit tests cover exact URLs, all reserved characters, Unicode, malformed refs/hosts, missing inputs, conflict behavior, and stable redacted errors.
- Python tests execute shared golden vectors and confirm psycopg receives a compatible URL after query sanitisation.
- Command tests spawn or stub Prisma generate/migrate, seeds, RLS wrappers, Next build/start modes, and worker startup without contacting real services.
- A client-boundary test builds or inspects the dependency graph/output and fails if the password variables, PostgreSQL URLs, or server adapter enter a client chunk.
- A repository scanner uses an allowlist for templates, test vectors, historical OpenSpec files, and generated/ignored directories. It reports paths and rule identifiers, never matched text.
- Live migration, seed, RLS, preview, staging, production, and Railway smoke checks remain operator gates because normal unit CI must not contact Supabase.

## Environment-Variable Contract

| Variable | Scope | Required | Treatment |
|---|---|---:|---|
| `SUPABASE_PROJECT_REF` | Build, server, worker | For any Supabase use | Canonical, validated, non-secret identifier |
| `SUPABASE_DB_PASSWORD` | Server/worker only | Database modes only | Canonical secret; URI-encoded in memory; never logged |
| `SUPABASE_DB_POOLER_HOST` | Build/server/worker | No | Non-secret validated override; defaults to the requested AP Southeast host |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser + server | Derived | Public output; never manually maintained after rollout |
| `DATABASE_URL` | Server/worker child processes | Derived | Secret pooled output on `6543`; never exposed to client code |
| `DIRECT_URL` | Migration/DB-admin child processes | Derived | Secret session-pooler output on `5432`; never used as app runtime URL |
| Existing publishable/secret keys | Existing scopes | Unchanged | Preserved without renaming or reconstruction |

Modes are explicit: `public` requires only the project ref; `generate` uses public configuration plus a fixed no-connect datasource placeholder; `runtime` requires the project ref and password and exposes the pooled URL only to server code; `migration`/`database-admin` require both and expose the port-5432 URL only to the intended process.

## Security Considerations

- Mark the database adapter server-only and enforce an import-boundary test. Do not export secret-bearing configuration from a barrel imported by client code.
- Never include environment objects, URL parser errors containing input, child-process env diffs, or raw matched scanner content in logs.
- Pass child environment through process APIs, not shell command interpolation. Display commands with variable names/placeholders only.
- Preserve the diagnostic redaction rules already covering `DATABASE_URL` and `DIRECT_URL`; add canonical password aliases and tests.
- Do not write derived credentials to disk, caches, generated source, build metadata, test snapshots, or API responses.
- Continue to scope `SUPABASE_SECRET_KEY` independently. This change does not make it public or derive it.

## Risks / Trade-offs

- **[Session pooler topology differs by project]** → Validate each project's dashboard host before rollout and set the restricted non-secret host override where required.
- **[Port-5432 session pooler semantics differ from the current direct host]** → Run `prisma migrate status`, a reversible migration check, and RLS application in non-production before production; retain a rollback path to the prior direct URL.
- **[Two language adapters drift]** → Keep topology data and golden vectors shared, compare exact outputs in CI, and prohibit construction elsewhere with the scanner.
- **[Next static analysis pulls server code client-side]** → Separate public/server modules physically and verify production client output.
- **[Build tools need configuration before app imports]** → Integrate directly in `next.config.ts`, `prisma.config.ts`, and script preludes rather than relying on runtime startup.
- **[Legacy equality checks compare secrets]** → Never report values, avoid telemetry fields carrying them, and remove platform legacy values promptly.
- **[Repository scanner flags documentation/history]** → Use narrow rule-specific allowlists; never globally exclude active source/config directories.

## Migration Plan

1. Add pure constructors, shared topology/vectors, redacted errors, and Node/Python unit tests without changing consumers.
2. Integrate public-only Next configuration and explicit Prisma generate mode; prove lint, unit tests, Prisma generation, and a production build need no database connection.
3. Integrate server runtime, Node scripts, Prisma migration/admin commands, and Python worker startup with equality-checked legacy coexistence.
4. Update safe templates and the canonical env matrix. Add `SUPABASE_PROJECT_REF` and `SUPABASE_DB_PASSWORD` to local, CI integration, Vercel Preview/Staging/Production, and all Railway services. Add a host override only where the dashboard host differs from the default.
5. In a non-production project, verify exact host/ports, run Prisma generation/status/deploy, apply RLS, run seed/verification, start Next, and start all three Railway process types. Test a reserved-character password using a temporary test credential or pure fixtures, never documentation.
6. Deploy compatibility code to preview/staging, then production. Confirm readiness and redacted diagnostics without inspecting values.
7. Remove externally materialised `NEXT_PUBLIC_SUPABASE_URL`, `DATABASE_URL`, and `DIRECT_URL` from platform settings and real local files. Redeploy/restart and repeat smoke checks.
8. Rotate a non-production database password by updating only `SUPABASE_DB_PASSWORD`; verify every consumer reconnects. Schedule the production rotation through the normal secret-management procedure.
9. Enable the repository drift check in CI and update all runbooks/instructions. Do not edit historical migrations, archived OpenSpec artifacts, real env files, or generated output.

Environment coverage:

- Local: canonical values in ignored `.env.local`; safe placeholders in examples.
- Unit CI: project ref fixture only for public/generate paths; fake passwords only inside tests; no database calls.
- Integration CI, if configured: canonical secrets from the CI secret store; never materialised URLs.
- Preview and staging: development/non-production project canonical values in Vercel and matching Railway services.
- Production: production project canonical values, independently scoped from preview/staging.

## Rollback Plan

1. Stop migration/seed jobs and roll application/worker deployments back to the previous release.
2. Recreate the previous `NEXT_PUBLIC_SUPABASE_URL`, `DATABASE_URL`, and `DIRECT_URL` in each platform secret store from approved Supabase/project records; do not recover them from logs or build artifacts.
3. If the database password was already rotated, construct all rollback URLs offline from the new password and verified project topology. Do not revert the database password merely to match stale URLs.
4. Restore the prior direct-host `DIRECT_URL` for Prisma/RLS commands if the session pooler caused the rollback.
5. Restart services, run non-secret readiness checks, then Prisma status and targeted smoke checks. Canonical variables may remain present because the old release ignores them.

## Acceptance Criteria

- Exact public, pooled, and migration URL tests pass, including every required reserved character and Unicode encoding.
- Missing/malformed input and incompatible legacy values fail before consumer startup with no secret-bearing output.
- `prisma generate`, migration/status/deploy wrappers, seed/reset/verification paths, Next build/runtime, and all Railway process types pass their scoped tests or documented live gates.
- A client artifact/import-boundary check proves server-only variables and URLs are absent.
- A log/error capture test proves canonical and derived secrets are absent on every failure path.
- Safe templates and platform/runbook matrices use canonical values; unrelated Supabase keys are unchanged.
- The repository scanner finds no unapproved active-source hard-coded Supabase project URLs, host construction, or PostgreSQL connection templates.
- Non-production password rotation succeeds by changing only `SUPABASE_DB_PASSWORD` and restarting consumers.

## Open Questions

- The exact session-pooler hostname for each existing Supabase project and whether every project exposes port `5432` cannot be confirmed from code. Operators must verify these in each project's Connect panel before implementation reaches deployment; the validated host override handles differences without changing the contract.
- Current Vercel and Railway dashboard values are not visible in the repository. The rollout inventory must confirm their scopes and service duplication before deleting legacy values.