# CashPlan Operations Runbook

This runbook covers CashPlan forecast generation, settings review, data-quality inspection, and export operations for local, preview, and production environments.

Current scope reflects shipped behavior:

- CashPlan forecast generation and summary APIs are live.
- CashPlan settings and related forecast views are live.
- Calendar, explanation, data-quality, periods, item, and export APIs are live.
- CashPlan consumes shared commitment and protected-cash signals rather than operating as an isolated ledger.

## 1. Operational flows

### 1.1 Forecast generation and summary

Primary paths:

- `lib/cashplan/engine.ts`
- `GET /api/cashplan/summary`
- `GET /api/cashplan/items`
- `GET /api/cashplan/periods`

Operational notes:

- CashPlan builds a forward cash view from opening cash, inflows, outflows, buffer targets, and shared module inputs.
- Forecast outputs include confidence, lowest closing cash, buffer gap, recommended actions, and data-quality issues.

### 1.2 Settings and operator review surface

Primary user-facing surface:

- `/dashboard/settings/cash-plan`

Primary routes:

- `GET/PUT /api/cashplan/settings`
- `GET /api/cashplan/explanation`
- `GET /api/cashplan/calendar`
- `GET /api/cashplan/data-quality`

The current UI surface centers on settings and related forecast views that use these APIs rather than on a separate standalone dashboard route documented in the runbook index.

### 1.3 Export and related integrations

Export endpoint:

- `GET /api/cashplan/export`

Cross-module integration:

- CommitGuard supplies committed outflow and free-cash context through `GET /api/commitguard/cashplan`.
- Tax Buffer and DepositGuard can contribute protected-cash and planned outflow context through the shared financial layer.

## 2. Environment variables

CashPlan introduces no dedicated environment variables and reuses the central matrix in `docs/runbooks/README.md`.

Relevant shared dependencies:

- Existing auth and database variables.
- Upstream accounting/provider variables when imported financial inputs feed the forecast.
- No dedicated cron, webhook, or module-only worker secret is required for the current shipped scope.

## 3. Operational boundaries

- CashPlan should remain described as a planning tool, not as a source-of-truth accounting ledger.
- Forecast confidence and data-quality warnings are part of the product behavior and should not be treated as incidental UI noise.
- Related cash plan views are implemented, but the canonical documented operator entry point is `/dashboard/settings/cash-plan`.

## 4. Troubleshooting

### 4.1 Forecast stays preliminary or low-confidence

Likely causes:

- Missing opening cash or source balances.
- Stale or low-confidence upstream inflow/outflow inputs.
- Buffer targets or settings exist, but core source inputs are incomplete.

Actions:

1. Review `/api/cashplan/data-quality` for missing-balance and stale-source issues.
2. Confirm the tenant has current financial inputs from accounting sync, commitments, and reserve context where expected.
3. Re-check the summary after the upstream data refresh completes.

### 4.2 CashPlan output disagrees with CommitGuard or Tax Buffer

Likely causes:

- The comparison is using outputs from different refresh times.
- CommitGuard commitments or Tax Buffer protected-cash values changed since the last forecast snapshot.

Actions:

1. Compare current `/api/cashplan/summary`, `/api/commitguard/cashplan`, and Tax Buffer summary outputs from the same tenant.
2. Revisit recent settings or override changes.
3. Treat the mismatch as an upstream input-timing issue before treating it as a forecast-engine defect.

### 4.3 Related cash plan views load but export or explanation looks incomplete

Likely causes:

- The forecast has insufficient detail for some derived explanations.
- The current period or filter selection has little or no data.

Actions:

1. Check `/api/cashplan/explanation`, `/api/cashplan/periods`, and `/api/cashplan/items` for the same tenant and period.
2. Confirm seeded or live scenario data exists.
3. Re-run after updating the underlying forecast inputs rather than widening the export blindly.