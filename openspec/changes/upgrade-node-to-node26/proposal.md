## Why

PaidSoon is currently running on an older Node baseline relative to the versions the app's runtime and deployment stack are already targeting. This upgrade is needed to keep the project aligned with current support windows, reduce risk from stale tooling, and avoid drift between local development, CI, and Vercel production. It is also the safest point to validate compatibility with the repo's current stack: Next.js 16, Prisma 7, Supabase/Stripe/Resend integrations, and the existing build pipeline.

## What Changes

- Standardize the project on Node 26 for local development, CI, and deployment runtime settings.
- Review and update any explicit Node version declarations, runtime configuration, or environment documentation needed for a clean Node 26 install.
- Validate the current application build, tests, Prisma generation, and deployment assumptions against Node 26 before rollout.
- Apply any required compatibility fixes or configuration adjustments only where the runtime upgrade exposes incompatibilities.
- Keep the change to runtime/tooling alignment; no user-facing product behavior or business logic changes are intended.

## Capabilities

### New Capabilities
- None — this is a tooling and runtime upgrade only.

### Modified Capabilities
- None — no spec-level behavior changes are required; the change explicitly opts out of specs via `skip_specs: true`.

## Impact

- Runtime configuration and developer environment setup
- CI / local toolchain compatibility checks
- Vercel deployment runtime alignment
- Prisma generation and build validation
- Documentation for Node version expectations and deployment requirements
- No changes to pricing, billing flows, invoice logic, or user-facing product behavior
