## 1. Module inventory and source mapping

- [x] 1.1 Confirm the implemented module set to cover in this change from `docs/DDD.md`, `docs/HLD.md`, and the existing runbook index: InvoiceGuard, DepositGuard, SpendLeak, Cost Guard, CommitGuard, CashPlan, Owner's Digest, Tax Buffer, MarginGuard, and RunwayGuard.
- [x] 1.2 For each module, record the owning routes, services, scheduled jobs, exports, and external-system dependencies that the runbook must reference.
- [x] 1.3 Define the final runbook file list and naming convention under `docs/runbooks/`, reusing `deposit-guard.md` as the structural baseline.

## 2. Receivables and spend-side runbooks

- [x] 2.1 Write the InvoiceGuard module runbook covering invoice intake, reminder flow, promise/dispute/manual action paths, env-var dependencies, and operator troubleshooting.
- [x] 2.2 Review `docs/runbooks/deposit-guard.md` against the new module-runbook contract and make any small consistency updates needed while preserving truthful current scope.
- [x] 2.3 Write the SpendLeak runbook covering ingestion assumptions, dashboard/export workflows, dependency on import freshness, and likely operator failure modes.
- [x] 2.4 Write the Cost Guard runbook covering baseline/rule/alert flows, cross-module dependencies, and troubleshooting for stale or missing cost signals.

## 3. Commitment, cash-planning, and executive runbooks

- [x] 3.1 Write the CommitGuard runbook covering commitment detection, review, horizon output, free-cash logic, and key operational checks.
- [x] 3.2 Write the CashPlan runbook covering forecast inputs, scenario or projection touchpoints, module dependencies, and operator troubleshooting.
- [x] 3.3 Write the Owner's Digest runbook covering generation, snapshot history, scheduled delivery, env-var/job dependencies, and delivery/debug troubleshooting.

## 4. Reserve, margin, and runway runbooks

- [x] 4.1 Write the Tax Buffer runbook covering reserve configuration, obligations, override/event flows, and troubleshooting for safe-to-spend discrepancies.
- [x] 4.2 Write the MarginGuard runbook covering summary/alerts/opportunities/export flows, cross-module inputs, and troubleshooting for missing or stale profitability signals.
- [x] 4.3 Write the RunwayGuard runbook covering snapshots, alerts, scenarios, dependency on CashPlan/Tax Buffer inputs, and operator troubleshooting.

## 5. Runbook index and cross-links

- [x] 5.1 Update `docs/runbooks/README.md` to list the module runbooks explicitly and group them separately from environment/service bring-up runbooks.
- [x] 5.2 Add or tighten cross-references between module runbooks and the existing service runbooks where external setup steps remain centralized.
- [x] 5.3 Verify each new runbook points back to the central env-var matrix instead of duplicating environment values.

## 6. Documentation verification

- [x] 6.1 Read each module runbook end-to-end and verify titles, module names, routes, services, jobs, exports, and troubleshooting steps match the current repo.
- [x] 6.2 Verify every planned or setup-dependent path remains labelled accordingly and no runbook overstates unimplemented behavior.
- [x] 6.3 Run `openspec validate build-module-runbooks --type change --strict` and fix any planning-artifact issues before implementation starts.