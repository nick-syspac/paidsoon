## Why

PaidSoon now exposes a broad module portfolio in product code, dashboard navigation, seeded QA flows, and marketing pages, but the operator runbooks only cover DepositGuard as a module-specific operational guide. That leaves delivery, support, and rollout knowledge scattered across code, DDD/HLD narrative, and change history instead of giving operators one repeatable playbook per module.

The gap matters now because the platform has crossed from a single receivables workflow into a multi-module operating surface. Support, QA, launch-readiness, and future handoff work need the same runbook shape for every implemented module before the documentation drifts further.

## What Changes

- Add module-specific operator runbooks under `docs/runbooks/` for the implemented PaidSoon module portfolio: InvoiceGuard, SpendLeak, CostGuard, CommitGuard, CashPlan, Owner's Digest, Tax Buffer, MarginGuard, and RunwayGuard.
- Use `docs/runbooks/deposit-guard.md` as the structural reference so each module runbook covers current shipped scope, operational flows, environment-variable dependencies via the central matrix, and troubleshooting.
- Update `docs/runbooks/README.md` so the runbook index explicitly lists and groups module runbooks alongside the existing environment and service runbooks.
- Define a consistent module-runbook content contract: current scope, primary operational paths, scheduler/webhook/manual touchpoints where applicable, required env-var references, and operator troubleshooting for the most likely failure modes.
- Keep availability language truthful to current implementation state, especially where a module includes planned or setup-dependent paths that must remain labelled accordingly.

## Capabilities

### New Capabilities

None. This change is documentation only.

### Modified Capabilities

None. No application requirements change.

## Impact

- Primary files added: new module runbooks in `docs/runbooks/` for implemented module areas that do not already have one.
- Primary files updated: `docs/runbooks/README.md`, plus any module docs that need cross-links or source-of-truth alignment while writing the runbooks.
- Source material touched for verification only: `docs/DDD.md`, `docs/HLD.md`, existing module routes/services under `app/` and `lib/`, and current seeded QA/runbook docs used to confirm operational behavior.
- No code changes, no schema changes, no API contract changes, and no new environment variables are expected from this change.