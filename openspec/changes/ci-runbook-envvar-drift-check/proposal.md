## Why

The drift between code and operator docs (env var names, webhook events, Supabase API key naming) was severe enough that `build-environment-runbooks` had to dedicate a whole section of its design to reconciling it. Drift will recur unless something automated catches it.

The single most error-prone surface is **env var names**: a misnamed var in a runbook leads to broken environments and silent failure modes (e.g., wrong `DATABASE_URL` bypasses RLS without any visible error).

A small CI check that asserts the runbook env-var matrix matches `grep -E "process\.env\.[A-Z_]+" -r app/ lib/ middleware.ts` in both directions would catch the entire class of drift at PR time.

## What Changes

- Add a script at `scripts/check-runbook-envvars.ts` that:
  - Extracts every `process.env.X` reference from `app/`, `lib/`, `middleware.ts`, and `prisma.config.ts` (ignoring framework-provided vars like `NODE_ENV`, `VERCEL_URL`).
  - Extracts every env var name from the matrix in [docs/runbooks/README.md](../../../docs/runbooks/README.md).
  - Exits non-zero if either set has names the other does not.
- Add an npm script `npm run check:runbook-envvars` that runs it.
- Wire it into CI (whatever workflow runs `npm run build` / lint today, alongside).
- Optionally: also assert that webhook event names listed in `docs/runbooks/stripe.md` appear in `app/api/webhooks/`. Out of scope for the MVP — env vars first.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None.

## Impact

- **Files added**: `scripts/check-runbook-envvars.ts`, possibly a CI workflow tweak.
- **Files changed**: `package.json` (add npm script).
- **Operator-facing impact**: PRs that add a new `process.env.X` without a runbook row (or vice versa) fail CI with a clear diff.
- **Reference**: `build-environment-runbooks` design "Risks / Trade-offs" and Open Questions sections call this out as a follow-up.
