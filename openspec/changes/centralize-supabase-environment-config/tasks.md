## 1. Deployment Preflight and Contract Fixtures

- [ ] 1.1 Inventory local, CI, Vercel Development/Preview/Production, and each Railway worker/beat/web service; record variable names and scopes without exporting or printing values.
- [ ] 1.2 Verify each Supabase project's Connect-panel transaction/session pooler hostname, confirm port `6543` runtime and port `5432` migration connectivity, and record only the non-secret host topology; stop rollout if the requested session-pooler behavior is unavailable.
- [x] 1.3 Add a checked-in non-secret topology contract with the `aws-1-ap-southeast-2.pooler.supabase.com` default, fixed ports/database/query parameters, and a restricted pooler-host override.
- [x] 1.4 Add shared golden vectors for valid refs, exact public/runtime/migration URLs, reserved-character and Unicode password encoding, invalid refs, and invalid pooler hosts using fake credentials only.

## 2. Authoritative Node Configuration

- [x] 2.1 Implement a side-effect-free public constructor that validates the lowercase 20-character project ref, constructs `https://<ref>.supabase.co`, and structurally validates the result without reading password variables.
- [x] 2.2 Implement a side-effect-free server constructor that requires the password only in database modes, percent-encodes all UTF-8 user-info bytes, constructs the exact port-6543 and port-5432 URLs, and structurally validates every fixed component and query parameter.
- [x] 2.3 Implement stable redacted configuration errors for missing/malformed inputs, invalid topology, invalid derived structure, and legacy conflicts; ensure errors never retain or serialise secret inputs/URLs.
- [x] 2.4 Add server-only environment and process-materialisation adapters with explicit `public`, `generate`, `runtime`, `migration`, and `database-admin` modes; do not expose the server adapter through client-importable barrels.
- [x] 2.5 Add transitional conflict handling that snapshots externally supplied `NEXT_PUBLIC_SUPABASE_URL`, `DATABASE_URL`, and `DIRECT_URL`, accepts only exact matches, makes canonical derivation authoritative, and emits at most variable-name-only deprecation notices.
- [x] 2.6 Add Node unit tests for all shared vectors, missing inputs, malformed refs, invalid hosts, exact query preservation, URL round-trip decoding, mode-specific password requirements, legacy equality/conflicts, and captured error/log redaction.

## 3. Next.js and Server Runtime Integration

- [x] 3.1 Update `next.config.ts` to load public configuration before compilation and materialise only `NEXT_PUBLIC_SUPABASE_URL`; prove it never imports or reads the server password adapter.
- [x] 3.2 Keep `lib/supabase/client.ts` limited to compile-time public values and update `lib/supabase/server.ts`, `proxy.ts`, cron/email/admin Supabase clients, and other server consumers to use the appropriate validated public/server boundary instead of independently trusting environment strings.
- [x] 3.3 Update `lib/db/admin.ts` and any database client factories to receive the derived pooled runtime URL from the server-only adapter rather than reading raw `DATABASE_URL`.
- [x] 3.4 Update diagnostics and tracing redaction/status checks to recognise `SUPABASE_DB_PASSWORD` and related aliases, report presence/status only, and never return canonical or derived secrets.
- [x] 3.5 Add import-boundary and production client-artifact tests proving `SUPABASE_DB_PASSWORD`, server adapter code, PostgreSQL schemes, and database URLs are absent while the public Supabase URL remains available.
- [x] 3.6 Run focused Next config/runtime tests, ESLint, TypeScript checks, and a production build with fake non-connecting inputs; confirm browser-only/build paths do not require the database password or contact Supabase.

## 4. Prisma and Node Command Bootstrap

- [x] 4.1 Update `prisma.config.ts` to load env files, select an explicit generate-only no-connect placeholder or the derived migration URL, remove the `DIRECT_URL ?? DATABASE_URL` fallback, and never print datasource values.
- [x] 4.2 Update `package.json` build/generate/migrate-related scripts so `prisma generate` declares generate-only mode and database commands obtain canonical configuration before Prisma evaluates its datasource.
- [x] 4.3 Extend `scripts/_loadEnv.ts` to derive and materialise scoped values after dotenv loading, preserving IPv4-first behavior and failing before importing database consumers.
- [x] 4.4 Add a no-shell-interpolation child-process wrapper for `psql` RLS/hotfix operations that passes only the required derived environment and never echoes command env or connection strings.
- [x] 4.5 Route seed, reset, RLS verification, preview verification, admin, MYOB reset, backfill, and other database-using Node scripts through the common bootstrap; remove duplicated missing-URL guidance and secret-bearing parse errors.
- [x] 4.6 Add command-level tests for Prisma generate without a password, migration/status with the port-5432 URL, seed/reset/verify startup with the correct scope, child-process env isolation, and redacted failure output without contacting a real database.

## 5. Python Worker Integration

- [x] 5.1 Add a single worker configuration adapter that validates canonical inputs/topology and derives the pooled URL with Python standard-library percent encoding against the shared golden vectors.
- [x] 5.2 Update `worker/paidsoon_worker/config.py` and database startup so Celery worker, Celery Beat, and web process database paths fail fast with redacted errors while pure-logic imports remain credential-free.
- [x] 5.3 Preserve and test `worker/paidsoon_worker/db.py` query sanitisation so psycopg receives no Prisma-only parameters and password encoding survives unchanged.
- [x] 5.4 Update `worker/.env.example`, `worker/railway.toml`, and worker documentation/start commands to use canonical inputs and an optional non-secret host override, with no preconstructed `DATABASE_URL`.
- [x] 5.5 Add Python tests for shared vector parity, missing/malformed input, topology override rejection, all reserved characters, no secret-bearing exceptions/logs, and startup behavior for all three Railway process types.

## 6. Safe Templates, CI, and Documentation

- [x] 6.1 Replace preconstructed Supabase/DB values in `.env.example`, `.env.local.example`, `.env.preview.example`, and `.env.production.example` with obvious canonical placeholders and optional topology guidance; preserve publishable, secret/service-role, JWT, and unrelated variables.
- [x] 6.2 Update `.github/workflows/test.yml` to use explicit generate/public test mode and fake canonical fixtures instead of placeholder `DATABASE_URL`/`DIRECT_URL`; add Node and Python contract/security checks without live service access.
- [x] 6.3 Update `README.md`, `docs/DDD.md`, and `docs/HLD.md` with the implemented configuration ownership, lifecycle boundaries, session-pooler migration, and server/client secret boundary.
- [x] 6.4 Update `docs/runbooks/README.md`, `docs/runbooks/supabase.md`, `docs/runbooks/vercel.md`, and `docs/runbooks/railway.md` with the canonical variable matrix, per-environment scopes, host verification, platform setup, migration, rotation, and rollback procedures.
- [x] 6.5 Update `docs/environment-promotion.md`, environment setup summaries, preview/seed documentation, admin/MYOB runbooks, and active command examples to use supported bootstrap commands rather than manually exported connection strings.
- [x] 6.6 Update applicable repository instruction, prompt, and environment-example checks so future changes preserve canonical construction and do not reintroduce raw URLs; leave archived OpenSpec artifacts and historical Prisma migrations unchanged.

## 7. Drift and Security Verification

- [x] 7.1 Implement a repository scanner that excludes ignored/generated/dependency/virtual-environment output, narrowly allowlists fixtures/history/documented placeholders, reports only rule IDs and paths, and rejects active-source hard-coded project URLs or PostgreSQL construction outside authoritative adapters.
- [x] 7.2 Add CI tests proving the scanner detects obsolete `*.supabase.co`, pooler-host construction, raw `postgresql://` templates, and direct reads of legacy URL variables without printing matched text.
- [x] 7.3 Run the scanner against the complete tracked repository and remove or migrate every unapproved duplicate reference in source, configs, scripts, tests, docs, and safe templates.
- [x] 7.4 Capture representative validation, conflict, child-process, Next build, Prisma, and Python worker failures and assert the fake password, encoded password, `DATABASE_URL`, and `DIRECT_URL` values never appear.
- [x] 7.5 Run the full Node test/lint/build suite and Python worker test suite; resolve only failures caused by this change and record any unavailable live-service checks for rollout.

## 8. Environment Migration and Rollout

- [ ] 8.1 Add `SUPABASE_PROJECT_REF` and `SUPABASE_DB_PASSWORD` to ignored local configuration and each managed CI/Vercel/Railway environment using secret-manager interfaces; add `SUPABASE_DB_POOLER_HOST` only where preflight found a different host, and never commit/export values.
- [ ] 8.2 With equality-checked legacy values still present, validate local development, Prisma generation/status/deploy, RLS application, seed/reset/verification, Next start, and all Railway worker/beat/web startup paths against a non-production project.
- [ ] 8.3 Deploy to preview and staging, run non-secret readiness plus targeted application/worker smoke checks, and confirm no build logs, diagnostics, API responses, or client artifacts contain canonical/derived secrets.
- [ ] 8.4 Deploy compatibility code to production, verify readiness and database-backed critical paths, and stop/rollback on any topology, migration, RLS, or credential conflict.
- [ ] 8.5 Remove externally materialised `NEXT_PUBLIC_SUPABASE_URL`, `DATABASE_URL`, and `DIRECT_URL` from local, CI, Vercel, and every Railway service; restart/redeploy and repeat environment-specific smoke checks.
- [ ] 8.6 Rotate a non-production database password by updating only `SUPABASE_DB_PASSWORD`, restart all consumers, and verify Prisma, Next server, seed/verification, Celery worker, Beat, and worker web connectivity while the public URL remains unchanged.
- [ ] 8.7 Schedule and execute production password rotation through the approved secret procedure, updating only `SUPABASE_DB_PASSWORD`, then complete the acceptance matrix without displaying any credential or connection string.

## 9. Rollback Drill and Final Acceptance

- [ ] 9.1 In non-production, drill rollback by stopping DB jobs, deploying the prior app/worker release, restoring legacy URLs in the platform secret stores from approved records using the current password, and restoring the prior direct-host migration URL if required.
- [ ] 9.2 Verify rollback readiness with non-secret status checks, Prisma status, RLS verification, targeted app flows, and all Railway process types; then return non-production to the canonical release.
- [ ] 9.3 Run `openspec validate centralize-supabase-environment-config --strict`, the repository drift check, all automated suites, and the documented local/CI/preview/staging/production acceptance checklist.
- [x] 9.4 Confirm the final repository diff contains no real `.env` files, credentials, generated Prisma/Next output, migration edits, unrelated Supabase variable changes, or secret-bearing logs/snapshots.