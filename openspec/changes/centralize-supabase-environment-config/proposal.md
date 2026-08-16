## Why

PaidSoon currently materialises the same Supabase project URL and database credentials independently in local templates, Vercel, Railway, CI, scripts, and runbooks. A database-password rotation therefore requires coordinated edits to multiple secret-bearing connection strings, and an unencoded reserved character can silently produce an invalid PostgreSQL URI.

The repository now has both Node/Prisma and Python worker consumers with different startup timing. Configuration must be derived and validated before those consumers start, without relying on environment-variable interpolation or exposing database credentials to browser bundles, logs, diagnostics, or generated output.

## What Changes

- **BREAKING** Replace manually maintained Supabase URLs and PostgreSQL connection strings with canonical `SUPABASE_PROJECT_REF` and server-only `SUPABASE_DB_PASSWORD` inputs.
- Introduce an authoritative, testable Supabase environment contract that validates the project reference, percent-encodes the database password, and derives:
  - `NEXT_PUBLIC_SUPABASE_URL` on `https://<project-ref>.supabase.co`;
  - pooled `DATABASE_URL` on port `6543` with `pgbouncer=true&connection_limit=1`;
  - migration `DIRECT_URL` on the same Supabase pooler topology at port `5432`.
- Materialise derived values before Next.js, Prisma CLI, Node operational scripts, and Railway worker processes start. Do not depend on `.env`, Vercel, Railway, GitHub Actions, or shell interpolation within environment-variable values.
- Separate public-only derivation from database derivation so browser-only compilation and pure tests do not require `SUPABASE_DB_PASSWORD`; database runtime, migration, seed, and integration paths fail fast when it is required but absent.
- Treat the Supabase pooler hostname as validated, non-secret deployment topology. The implementation will use the requested `aws-1-ap-southeast-2.pooler.supabase.com` default while retaining an explicit topology override for projects in another Supabase region, because current templates and runbooks support region-specific hosts.
- Add equality-checked migration handling for externally materialised `NEXT_PUBLIC_SUPABASE_URL`, `DATABASE_URL`, and `DIRECT_URL`: matching values may be accepted during the rollout window, incompatible values fail without printing either value, and the legacy values are then removed from platform configuration.
- Preserve `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, and unrelated Supabase configuration unchanged.
- Update safe environment templates, deployment/runbook documentation, CI wiring, and repository checks. Never modify real `.env` files or generated Prisma/Next output.
- Add unit, worker-contract, command-path, client-boundary, redaction, and repository-wide drift tests covering URL construction, reserved-character encoding, validation failures, startup modes, and removal of obsolete hard-coded connection strings.

## Capabilities

### New Capabilities

- `supabase-environment-configuration`: Defines canonical Supabase inputs, deterministic public and database URL derivation, secret boundaries, startup/bootstrap behaviour, compatibility rules, and verification across local, CI, Vercel, Railway, Prisma, and test paths.

### Modified Capabilities

None.

## Impact

- Environment and command entry points: `.env.example`, `.env.local.example`, `.env.preview.example`, `.env.production.example`, `worker/.env.example`, `package.json`, `next.config.ts`, `prisma.config.ts`, `scripts/_loadEnv.ts`, `.github/workflows/test.yml`, `worker/railway.toml`, and Railway dashboard start commands.
- Runtime consumers: `lib/supabase/client.ts`, `lib/supabase/server.ts`, `lib/db/admin.ts`, `proxy.ts`, server-only Supabase admin call sites, and `worker/paidsoon_worker/config.py` / `db.py`.
- Operational consumers: Prisma generation and migrations, `psql` RLS application, local reset/seed/verification scripts, preview seeding, admin scripts, Vercel build/start, and the three Railway worker services.
- Documentation and policy: `README.md`, `docs/DDD.md`, `docs/HLD.md`, `docs/environment-promotion.md`, `docs/runbooks/README.md`, `docs/runbooks/supabase.md`, `docs/runbooks/vercel.md`, `docs/runbooks/railway.md`, environment setup/seed guides, and relevant repository instruction/prompt checks.
- Current-state findings: `prisma.config.ts` loads `.env.local`/`.env` and selects `DIRECT_URL` before application code; `package.json` runs `prisma generate` before `next build`; `.github/workflows/test.yml` supplies placeholder URLs for generation; `scripts/_loadEnv.ts` only loads `.env.local`; the Python worker reads a preconstructed `DATABASE_URL`; and current runbooks describe a direct `db.<ref>.supabase.co:5432` migration URL rather than the requested port-5432 session-pooler URL.
- No Django, Docker/Docker Compose, or checked-in Railway secret definitions were found. `lib/generated/prisma/`, `.next/`, dependency directories, Python virtual environments, and real ignored `.env*` files are generated or sensitive and must not be edited.
- No new third-party dependency is expected; Node URL APIs and Python standard-library URL encoding are sufficient. Deployment configuration changes are required in Vercel and Railway because those platforms cannot be assumed to interpolate or URL-encode nested environment values.