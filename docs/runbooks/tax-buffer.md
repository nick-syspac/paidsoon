# Tax Buffer Operations Runbook

This runbook covers Tax Buffer reserve estimation, obligation review, override handling, and settings operations for local, preview, and production environments.

Current scope reflects shipped behavior:

- Tax Buffer summary, obligations, settings, and overrides are live.
- Snapshot persistence and deduplicated event emission are live.
- Tax Buffer is presented as an estimate and control layer, not as tax advice.

## 1. Operational flows

### 1.1 Summary calculation and snapshot persistence

Primary paths:

- `lib/taxBuffer/engine.ts`
- `lib/taxBuffer/service.ts`
- `GET /api/tax-buffer/summary`

Operational notes:

- Tax Buffer combines financial invoices, imported bills, available reserve context, and near-term cash-plan outflows.
- Summary loading persists `TaxBufferSnapshot` rows and emits deduplicated `TaxBufferEvent` records for material reserve-health changes.

### 1.2 Obligations, settings, and override handling

Primary user-facing surfaces:

- `/dashboard/tax-buffer`
- `/dashboard/settings/tax-buffer`

Primary routes:

- `GET /api/tax-buffer/obligations`
- `GET/PUT /api/tax-buffer/settings`
- `GET/POST /api/tax-buffer/overrides`
- `GET/PUT /api/settings/tax-buffer` as the compatibility alias

Operational notes:

- First-time suggested defaults are part of the current settings flow.
- Override creation is auditable and intentionally separate from automatic reserve calculations.

## 2. Environment variables

Tax Buffer introduces no dedicated environment variables and reuses the central matrix in `docs/runbooks/README.md`.

Relevant shared dependencies:

- Existing auth and database configuration.
- Upstream accounting and financial-layer inputs when obligations and reserve estimates depend on imported provider data.
- No dedicated cron, webhook, or internal-job secret is required for the current shipped scope.

## 3. Operational boundaries

- Tax Buffer must remain described as an estimate, not accounting or tax advice.
- User-facing Tax Buffer data access stays RLS-scoped through `withUserContext`.
- Export-grade reporting and broader adviser workflows remain deferred and should not be presented as operational today.

## 4. Troubleshooting

### 4.1 Safe-to-spend number looks wrong

Likely causes:

- Reserve categories or recurrence settings changed.
- Near-term commitment or cash-plan inputs changed since the last summary.
- Manual reserve balance inputs are stale.

Actions:

1. Review current settings, reserve categories, and manual balance controls.
2. Compare the latest Tax Buffer summary with current commitments and cash-plan context.
3. Check whether a recent override changed the expected reserve gap.

### 4.2 Obligations or categories are missing

Likely causes:

- The tenant has not applied first-time suggested defaults.
- Source financial data is incomplete.
- A category was disabled in settings.

Actions:

1. Open `/dashboard/settings/tax-buffer` and confirm current configuration.
2. Check whether the tenant has reliable upstream invoice and bill inputs.
3. Re-run the summary after correcting configuration rather than forcing manual overrides first.

### 4.3 Reserve-health events seem repetitive or noisy

Likely causes:

- The underlying reserve gap is oscillating around a threshold.
- Operators are comparing raw summary movement rather than deduplicated event keys.

Actions:

1. Inspect the underlying reserve change and current thresholds.
2. Confirm the repeated notifications are not separate dedupe keys for distinct conditions.
3. Adjust settings only after confirming the issue is threshold fit, not stale inputs.