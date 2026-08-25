# Supabase environment rollout checklist

This checklist condenses the remaining operator-only rollout tasks for the canonical Supabase environment change. It covers the OpenSpec tasks in `centralize-supabase-environment-config` sections 8 and 9.

Use this alongside these detailed runbooks:

- [README.md](./README.md) for the canonical environment-variable matrix.
- [supabase.md](./supabase.md) for Connect-panel topology, Prisma, RLS, password rotation, and rollback rules.
- [vercel.md](./vercel.md) for Vercel environment scopes, redeploys, and application smoke checks.
- [railway.md](./railway.md) for worker, Beat, trigger-web, burn-in, and rollback checks.

## Rules

- Never print, commit, or paste secret values or derived URLs into docs, tickets, logs, or shell history.
- Record only variable names, scopes, status, and pass/fail outcomes.
- Stop the rollout on any topology mismatch, `SUPABASE_LEGACY_CONFLICT`, Prisma migration failure, RLS failure, or critical path regression.
- Keep equality-checked legacy `NEXT_PUBLIC_SUPABASE_URL`, `DATABASE_URL`, and `DIRECT_URL` values in place until the checklist explicitly tells you to remove them.

## Operator evidence sheet

Create one private note or ticket with this template and update it as you go:

| Item | Local | CI | Vercel Preview | Vercel Production | Railway Staging | Railway Production | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPABASE_PROJECT_REF` present |  |  |  |  |  |  |  |
| `SUPABASE_DB_PASSWORD` present |  |  |  |  |  |  |  |
| `SUPABASE_DB_POOLER_HOST` required |  |  |  |  |  |  | Omit unless Connect panel differs |
| Legacy `NEXT_PUBLIC_SUPABASE_URL` still present |  |  |  |  |  |  |  |
| Legacy `DATABASE_URL` still present |  |  |  |  |  |  |  |
| Legacy `DIRECT_URL` still present |  |  |  |  |  |  |  |
| Connect-panel host verified |  |  |  |  |  |  |  |
| Port `6543` runtime verified |  |  |  |  |  |  |  |
| Port `5432` migration verified |  |  |  |  |  |  |  |

## 1. Preflight inventory and topology gate

Complete this before touching any production-like deployment.

1. Inventory where the canonical variables must exist:
   - local ignored `.env.local`
   - CI secret store
   - Vercel `Development`, `Preview`, and `Production`
   - Railway `staging` services: `paidsoon-worker`, `paidsoon-beat`, `paidsoon-trigger-web`
   - Railway `production` services: `paidsoon-worker`, `paidsoon-beat`, `paidsoon-trigger-web`
2. In each Supabase project, open **Connect** and record privately:
   - the 20-character project ref
   - the Shared Pooler host
   - confirmation that runtime uses `6543`
   - confirmation that migration/session mode uses `5432`
3. If any project does not support the required session-pooler path on `5432`, stop here.
4. Set `SUPABASE_DB_POOLER_HOST` only for environments whose Connect panel differs from the default documented host.

Exit criteria:

- Every target environment is inventoried.
- Every Supabase project has a verified non-secret topology record.
- Any required host override is identified before rollout.

## 2. Seed canonical inputs with legacy values still present

This covers the compatibility rollout stage.

1. Add `SUPABASE_PROJECT_REF` and `SUPABASE_DB_PASSWORD` to every inventoried environment through the platform secret manager.
2. Add `SUPABASE_DB_POOLER_HOST` only where step 1 identified a non-default host.
3. Do not remove `NEXT_PUBLIC_SUPABASE_URL`, `DATABASE_URL`, or `DIRECT_URL` yet.
4. Confirm no secret store entry contains a manually constructed PostgreSQL URL for the new rollout path.

Exit criteria:

- Canonical variables exist everywhere required.
- Legacy values still exist only for compatibility checking.
- No environment stores new handcrafted runtime or migration URLs.

## 3. Non-production validation with compatibility mode

Run this first against `paidsoon-dev` / preview-staging equivalents.

### Local and CI

1. Pull or set local canonical variables in ignored config only.
2. Run:

```bash
openspec validate centralize-supabase-environment-config --strict
npm run check:supabase-environment
npm test
npm run lint
npm run build
npm run verify:supabase-client
cd worker && PYTHONPATH=$PWD .venv/bin/python -m unittest discover -s tests
```

3. Run database-backed checks against the non-production project:

```bash
npm run prisma:migrate:status
npm run prisma:migrate:deploy
npm run db:apply-rls
npm run verify-rls
npm run db:seed
npm run verify-seed
```

4. Start the app locally and confirm the primary authenticated flow still works.

### Preview and Railway staging

1. Deploy Vercel Preview/staging with canonical variables and matching preview keys.
2. Deploy Railway staging in this order:
   - Redis
   - `paidsoon-trigger-web`
   - `paidsoon-worker`
   - `paidsoon-beat`
3. Run the Railway checks from [railway.md](./railway.md):
   - `/healthz`
   - unauthenticated trigger `401`
   - Beat heartbeat observed
   - one queued `Sync now` path completes end to end
4. Run targeted preview smoke checks:
   - sign-in
   - dashboard load
   - server-side Supabase paths
   - one Prisma-backed mutation
   - one worker-triggered path
5. Inspect build logs, diagnostics, and client artifacts for leaked canonical or derived secrets.

Exit criteria:

- Non-production Prisma, RLS, seed, app, and worker paths all pass.
- No `SUPABASE_LEGACY_CONFLICT` or secret leak is observed.
- Preview and Railway staging are stable enough for production compatibility deploy.

## 4. Production compatibility deploy

Deploy code first while legacy values are still present.

1. Confirm production secret stores now contain canonical variables.
2. Deploy Vercel Production.
3. Deploy Railway production in the controlled order from [railway.md](./railway.md).
4. Run production readiness checks without removing legacy values yet:
   - `npm run prisma:migrate:status`
   - `npm run verify-rls`
   - key authenticated dashboard flow
   - one billing-critical path
   - one worker-triggered path
   - watchdog / heartbeat status
5. Stop and roll back immediately on topology mismatch, RLS regression, Prisma failure, or a secret-bearing log.

Exit criteria:

- Production runs the compatibility release cleanly.
- Canonical inputs are authoritative and legacy values still match exactly.

## 5. Remove legacy materialized URLs

Do this only after the compatibility deploy has been clean in each target environment.

1. Remove externally stored `NEXT_PUBLIC_SUPABASE_URL`, `DATABASE_URL`, and `DIRECT_URL` from:
   - local ignored config
   - CI secret store
   - Vercel `Development`, `Preview`, `Production`
   - Railway staging services
   - Railway production services
2. Redeploy or restart every affected consumer.
3. Repeat the environment-specific smoke checks from sections 3 and 4.

Exit criteria:

- No environment relies on externally materialized compatibility URLs.
- Smoke checks still pass after restart/redeploy.

## 6. Password rotation rehearsal and production rotation

### Non-production rehearsal

1. Stop migration, seed, and scheduler jobs.
2. Rotate the non-production Supabase database password.
3. Update only `SUPABASE_DB_PASSWORD` in local, Vercel Preview/staging, and Railway staging.
4. Restart or redeploy all consumers.
5. Verify:
   - `npm run prisma:migrate:status`
   - `npm run verify-rls`
   - app sign-in and dashboard load
   - seed/verification commands
   - worker, Beat, and trigger web health
6. Confirm the public Supabase URL did not change.

### Production rotation

1. Schedule an approved maintenance window.
2. Stop Beat and other DB jobs.
3. Rotate the production database password.
4. Update only `SUPABASE_DB_PASSWORD` in Vercel Production and Railway production.
5. Redeploy or restart all production consumers.
6. Repeat the same verification set as non-production.

Exit criteria:

- Rotation succeeds by changing only `SUPABASE_DB_PASSWORD`.
- Public URL and project ref remain unchanged.

## 7. Rollback drill

Practice this in non-production before relying on it in production.

1. Stop Beat and other DB jobs.
2. Deploy the prior app and worker release.
3. Restore approved legacy URL values in the platform secret stores using the current password and verified topology.
4. Restore the prior direct-host migration URL only if the old release requires it for migration tooling.
5. Restart services.
6. Verify:
   - Prisma status
   - RLS isolation
   - targeted app flows
   - worker, Beat, and trigger-web startup
7. Return non-production to the canonical release and repeat the acceptance checks.

Exit criteria:

- Operators can restore the prior release without guessing connection-string shape.
- Rollback readiness is proven before production dependency on the new path.

## 8. Final acceptance sign-off

Mark the change operationally complete only when all of these are true:

1. `openspec validate centralize-supabase-environment-config --strict` passes.
2. `npm run check:supabase-environment` passes.
3. Full automated suites pass:

```bash
npm test
npm run lint
npm run build
npm run verify:supabase-client
cd worker && PYTHONPATH=$PWD .venv/bin/python -m unittest discover -s tests
```

4. The documented local, CI, preview/staging, and production acceptance checks above are all recorded as pass.
5. No real `.env` files, credentials, generated output, migration edits, unrelated variable churn, or secret-bearing logs are present in the final repo diff.

## OpenSpec task mapping

| Task | Checklist section |
| --- | --- |
| 8.1 | Sections 1 and 2 |
| 8.2 | Section 3 |
| 8.3 | Section 3 |
| 8.4 | Section 4 |
| 8.5 | Section 5 |
| 8.6 | Section 6 (non-production rehearsal) |
| 8.7 | Section 6 (production rotation) |
| 9.1 | Section 7 |
| 9.2 | Section 7 |
| 9.3 | Section 8 |