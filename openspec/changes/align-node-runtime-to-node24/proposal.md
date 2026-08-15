## Why

PaidSoon must use a Node version supported by Vercel across local development, CI, and deployment. Vercel currently supports Node 24 but rejects Node 26 before dependency installation or application build. Standardizing on Node 24 removes that deployment blocker and prevents runtime drift while retaining compatibility with the current Next.js 16 and Prisma 7 stack.

## What Changes

- Standardize the project on Node 24 for local development, CI, and deployment runtime settings.
- Review and update explicit Node version declarations, runtime configuration, and environment documentation for Node 24.
- Validate the current application build, tests, Prisma generation, and deployment assumptions against Node 24 before rollout.
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
