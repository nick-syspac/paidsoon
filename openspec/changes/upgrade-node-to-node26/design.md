## Context

The repository is already aligned around a modern Next.js stack (Next.js 16, React 19, Prisma 7, Tailwind 4) and is deployed through Vercel with a Prisma generate step in the build pipeline. The current Node version expectations are not explicitly locked to the latest supported major in project configuration, so the runtime baseline can drift silently across environments. This makes upgrades harder to reason about and creates avoidable differences between local, CI, and production behavior.

## Goals / Non-Goals

**Goals:**
- Unify the project on Node 26 as the supported runtime for local dev and deployment.
- Verify the current toolchain still works under Node 26 without changing product logic.
- Keep the upgrade path explicit and reversible with a documented compatibility checklist.

**Non-Goals:**
- No feature work or UX changes beyond runtime compatibility.
- No dependency overhaul unrelated to the Node version upgrade.
- No spec-level product behavior changes; this is an operational toolchain update.

## Decisions

- **Node 26 will be treated as the target runtime baseline, not a feature branch.** The change is scoped to runtime compatibility and environment alignment rather than any new business capability.
- **Compatibility validation happens before rollout.** The build, Prisma generation, and relevant tests must pass under Node 26 before the project is considered upgraded.
- **Runtime alignment is handled in the smallest possible surface area.** If a compatibility issue appears, the fix will be minimal and scoped to environment config or dependency constraints rather than altering app logic.
- **The project will not broaden scope into unrelated modernization.** This avoids conflating a runtime upgrade with a broader cleanup or package migration.

## Risks / Trade-offs

- [Runtime compatibility drift] → Mitigation: run the project build and tests under Node 26 and verify Prisma generation and Next.js runtime behavior explicitly.
- [Environment mismatch between developer machines and Vercel] → Mitigation: document the runtime baseline and keep build/deploy config aligned to the same Node major.
- [Unexpected dependency incompatibility] → Mitigation: isolate compatibility fixes to the minimum required patches and avoid speculative package upgrades outside the Node upgrade.

## Migration Plan

1. Confirm the Node version declarations for local, CI, and deployment configuration.
2. Validate the project under Node 26 using the repository's normal build and test commands.
3. Resolve any compatibility issues found in Prisma, Next.js, or env/runtime assumptions.
4. Update docs or config to reflect the supported version once the validation passes.
5. Deploy the runtime upgrade to preview or production and monitor startup/build behavior closely.

## Open Questions

- Whether the repo should pin a specific Node 26 minor version or simply declare the major as the supported baseline, depending on the deployment provider's support policy.
- Whether any CI provider or Vercel setting expects a separate runtime file or explicit env variable beyond the package manager/runtime config.

These questions are safe to answer during implementation without changing the overall upgrade approach.
