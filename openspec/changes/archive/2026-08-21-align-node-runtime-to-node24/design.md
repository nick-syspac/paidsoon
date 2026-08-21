## Context

The repository uses Next.js 16, React 19, Prisma 7, and Tailwind 4, and deploys through Vercel with a Prisma generate step in the build pipeline. A previous attempt to standardize on Node 26 succeeded locally and in CI but failed before the Vercel build because Vercel currently supports Node 24, 22, and 20. The runtime baseline must therefore match Node 24 across local development, CI, and deployment.

## Goals / Non-Goals

**Goals:**
- Unify the project on Node 24 as the supported runtime for local development, CI, and deployment.
- Verify the current toolchain works under Node 24 without changing product logic.
- Keep the upgrade path explicit and reversible with a documented compatibility checklist.

**Non-Goals:**
- No feature work or UX changes beyond runtime compatibility.
- No dependency overhaul unrelated to the Node version upgrade.
- No spec-level product behavior changes; this is an operational toolchain update.

## Decisions

- **Node 24 is the deployment runtime baseline.** Vercel supports Node 24 and recommends declaring it as `24.x` in `package.json`.
- **Compatibility validation happens before rollout.** The build, Prisma generation, and relevant tests must pass under Node 24 before the project is considered aligned.
- **Runtime alignment is handled in the smallest possible surface area.** If a compatibility issue appears, the fix will be minimal and scoped to environment config or dependency constraints rather than altering app logic.
- **The project will not broaden scope into unrelated modernization.** This avoids conflating a runtime upgrade with a broader cleanup or package migration.

## Risks / Trade-offs

- [Runtime compatibility drift] → Mitigation: run the project build and tests under Node 24 and verify Prisma generation and Next.js runtime behavior explicitly.
- [Environment mismatch between developer machines and Vercel] → Mitigation: document the runtime baseline and keep build/deploy config aligned to the same Node major.
- [Unexpected dependency incompatibility] → Mitigation: isolate compatibility fixes to the minimum required patches and avoid speculative package upgrades outside the Node upgrade.

## Migration Plan

1. Confirm the Node version declarations for local, CI, and deployment configuration.
2. Validate the project under Node 24 using the repository's normal build and test commands.
3. Resolve any compatibility issues found in Prisma, Next.js, or env/runtime assumptions.
4. Update docs or config to reflect the supported version once the validation passes.
5. Deploy the runtime upgrade to preview or production and monitor startup/build behavior closely.

## Open Questions

- Whether to add Node 26 as a non-blocking compatibility job after Vercel adds support for that runtime.
