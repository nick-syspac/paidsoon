## Context

See proposal.md for motivation. The existing operator runbooks already establish a strong pattern for service-level and module-level operational documentation: `docs/runbooks/README.md` is the canonical index and environment-variable matrix, while `docs/runbooks/deposit-guard.md` is the only current module-specific operations runbook. The broader product surface now spans additional implemented modules documented across `docs/DDD.md`, `docs/HLD.md`, seeded QA coverage, dashboard routes, and module-specific `lib/**` / `app/**` code, but there is no equivalent runbook set for those modules.

This change is documentation only. No runtime behavior, env vars, schema, or API contracts should change. The main constraint is truthfulness: each runbook must describe only shipped or operator-relevant setup-dependent behavior, and anything still planned must stay explicitly labelled planned rather than being promoted to operational MVP scope.

## Goals / Non-Goals

**Goals:**

- Produce a consistent module-runbook set under `docs/runbooks/` for the implemented PaidSoon modules that currently lack one.
- Reuse the proven `deposit-guard.md` structure so operators can move between module runbooks without relearning the format.
- Source each runbook from canonical evidence already present in the repo: `docs/DDD.md`, `docs/HLD.md`, the env-var matrix in `docs/runbooks/README.md`, seeded QA coverage, and the owning code paths in `lib/**`, `app/**`, and worker-trigger routes where relevant.
- Update the top-level runbook index so module runbooks are discoverable as first-class operator docs, not buried behind service bring-up material.

**Non-Goals:**

- No new implementation work for module features that are missing, partial, or only scaffolded.
- No attempt to convert every non-runbook module doc in `docs/` into the new format.
- No duplication of the central environment-variable matrix inside each module runbook.
- No creation of external-service runbooks beyond the module set requested here.

## Decisions

### Decision 1: Create one runbook file per implemented module, using canonical module naming rather than internal folder casing

- Decision: Add dedicated runbooks for InvoiceGuard, SpendLeak, Cost Guard, CommitGuard, CashPlan, Owner's Digest, Tax Buffer, MarginGuard, and RunwayGuard, with hyphenated Markdown filenames consistent with `deposit-guard.md` and other runbooks. DepositGuard itself remains the reference file and is only adjusted if minor consistency fixes are needed while updating the index.
- Rationale: Operators need one stable destination per module. Hyphenated doc filenames match the existing runbook style better than internal TypeScript folder casing, while module branding such as `InvoiceGuard` is clearer than the historical `paidsoon` route alias when the goal is operational documentation.
- Alternatives considered:
- Keep all module operations in one omnibus module runbook: rejected because troubleshooting and ownership become hard to scan as the portfolio grows.
- Name files after internal folder names such as `costGuard.md` or `ownersDigest.md`: rejected because it breaks the established runbook naming style and reads like source code rather than operator documentation.

### Decision 2: Standardize a module-runbook contract based on `deposit-guard.md`, but allow sections to stay concise when a module has fewer operational touchpoints

- Decision: Each new runbook will follow the same top-level shape: scope statement, operational flows, environment-variable dependencies (referencing `docs/runbooks/README.md` rather than restating values), and troubleshooting. Within that shape, content depth scales with the module's real operational surface. Modules with cron jobs, internal jobs, exports, or cross-module feeds document those paths; modules without webhooks or background dispatch stay shorter.
- Rationale: Consistent shape helps support and QA, but forcing identical length would create filler and increase drift risk. The DepositGuard runbook succeeds because it is structured, not because every section is equally long.
- Alternatives considered:
- Make every runbook identical in size and subsection count: rejected because simple modules would accumulate speculative or repetitive content.
- Write free-form module narratives: rejected because the user explicitly wants a repeatable format like `deposit-guard.md`.

### Decision 3: Treat DDD/HLD as the module inventory, but confirm operational facts from the owning code paths before writing troubleshooting steps

- Decision: Use `docs/DDD.md` and `docs/HLD.md` to define module boundaries, implemented status, and major route/service ownership. Use the nearest owning code paths named there to confirm operational flows, background jobs, exports, and operator-visible failure modes before finalizing each runbook. Reuse existing runbooks and seeded QA docs where they already capture validated operator workflows.
- Rationale: DDD/HLD are the fastest way to map the full module set, but troubleshooting advice is only trustworthy when it reflects the actual control paths in code. This avoids writing polished but incorrect runbooks.
- Alternatives considered:
- Write only from DDD/HLD prose: rejected because those docs describe architecture but not always the concrete operator failure modes or auth/secrets involved.
- Read every module implementation exhaustively first: rejected because it is unnecessary for a docs proposal and would over-explore beyond what the tasks need.

### Decision 4: Keep runbook ownership split between module docs and service docs instead of copying setup instructions into each module file

- Decision: Module runbooks will reference the existing service runbooks for external-system setup such as Stripe, Resend, Supabase, Railway, MYOB, and Xero. They will document which integrations, jobs, or env vars materially affect a module, but the actual provider setup steps stay centralized in the existing service runbooks.
- Rationale: The current runbook system already separates environment bring-up from service-specific operations. Repeating those steps in every module file would create contradictory setup instructions quickly.
- Alternatives considered:
- Make each module runbook fully standalone including all dependency setup: rejected because that duplicates large portions of Stripe, Resend, Railway, and Supabase guidance.
- Leave dependency references implicit: rejected because operators need to know where to go next when a module depends on one of those systems.

## Risks / Trade-offs

- [Risk] Module runbooks may overstate features that are implemented only for selected plans or still partially setup-dependent. -> Mitigation: anchor scope statements to the existing entitlement and implementation docs, and label planned/setup-required paths explicitly.
- [Risk] Some modules share infrastructure, which can tempt copy-paste troubleshooting that later drifts. -> Mitigation: keep common configuration in `docs/runbooks/README.md` and service runbooks; keep module runbooks focused on module-specific flows and symptoms.
- [Risk] InvoiceGuard naming could be confused with the product/company name `PaidSoon` or the legacy `/paidsoon` route alias. -> Mitigation: use `InvoiceGuard` consistently in the runbook title and describe it once as the receivables module within PaidSoon.
- [Risk] The repo has both user-facing module docs and operator runbooks, which can diverge in tone or status. -> Mitigation: update cross-links only where needed and treat code plus DDD/HLD as the source of truth for implemented state.

## Migration Plan

1. Inventory the implemented module set and map each module to its owning routes/services using `docs/DDD.md`, `docs/HLD.md`, and existing runbooks.
2. Define the file list and shared content contract for the new module runbooks.
3. Draft the missing module runbooks in `docs/runbooks/`, keeping env-var references pointed at the central matrix and setup steps pointed at the existing service runbooks.
4. Update `docs/runbooks/README.md` to list the module runbooks as part of the operator documentation entry points.
5. Validate the change with `openspec validate build-module-runbooks --type change --strict` and perform a doc-review pass to confirm module names, routes, jobs, env vars, and planned-scope labels match the repo.

Rollback strategy: revert the new runbook files and the README index update as one documentation-only change.

## Open Questions

None.