# SpendLeak Operations Runbook

This runbook covers SpendLeak spend-ingestion, finding generation, dashboard review, and export operations for local, preview, and production environments.

Current scope reflects shipped behavior:

- Spend ingestion from normalized provider and import data is live.
- Deterministic findings and grounded summaries are live.
- Dashboard, finding detail, and CSV/XLSX export are live.
- SpendLeak remains read-only and does not write back to accounting providers.

## 1. Operational flows

### 1.1 Spend data ingestion and freshness

SpendLeak depends on normalized spend records already present in the PaidSoon financial layer.

Primary sources:

- Xero and MYOB accounting syncs.
- Spend import flows under `app/api/spend-imports/**`.
- Persisted spend data and finding upserts in `lib/spendleak/**`.

Primary paths:

- `lib/spendleak/engine.ts`
- `lib/spendleak/persist.ts`
- `GET /api/cron/sync-accounting`

Operational notes:

- Freshness matters more than request volume. Stale or incomplete source data should surface as stale, initial-sync, or no-findings states rather than fabricated savings claims.
- SpendLeak findings are analysis outputs, not accounting mutations.

### 1.2 Findings dashboard and detail review

Primary user-facing surfaces:

- `/dashboard/spendleak`
- `/dashboard/spendleak/[id]`
- `GET /api/spend-insights/[id]`

Finding families include recurring-spend, duplicate-spend, renewal, supplier-concentration, and cash-pressure patterns derived from persisted evidence.

### 1.3 SpendLeak export

Export endpoint:

- `GET /api/spendleak/export`

Behavior:

- Supports CSV and XLSX output.
- Exports the current SpendLeak dashboard scope, including optional `module` filtering.
- Keeps fields analysis-only rather than producing accounting-import output.

Primary paths:

- `app/api/spendleak/export/route.ts`
- `lib/spendleak/exportQuery.ts`
- `lib/spendleak/export.ts`
- `lib/spendleak/exportFields.ts`

## 2. Environment variables

SpendLeak introduces no module-specific environment variables and reuses the central matrix in `docs/runbooks/README.md`.

Required when provider sync supplies spend data:

- `CRON_SECRET`
- `XERO_CLIENT_ID`
- `XERO_CLIENT_SECRET`
- `XERO_REDIRECT_URI`
- `MYOB_CLIENT_ID`
- `MYOB_CLIENT_SECRET`
- `MYOB_REDIRECT_URI`
- `TOKEN_ENCRYPTION_KEY`

Optional supporting paths:

- Spend imports use the app's existing authenticated upload flow and need no separate module-only secret.

Provider setup remains centralized in `supabase.md`, `myob.md`, `stripe.md`, `vercel.md`, and `railway.md` where applicable.

## 3. Operational boundaries

- SpendLeak is read-only with respect to provider systems.
- Findings update in place from persisted evidence instead of generating duplicate issues on every pass.
- Export is gated by the existing `csv_export` feature.

## 4. Troubleshooting

### 4.1 Dashboard shows stale or empty SpendLeak state

Likely causes:

- Accounting sync has not run recently.
- Spend import has not completed or did not produce valid normalized rows.
- The tenant has no usable spend evidence yet.

Actions:

1. Check the latest accounting or spend import run for the tenant.
2. Trigger a sync or review import status if fresh data is expected.
3. Confirm the stale state clears only after new persisted evidence exists.

### 4.2 Findings look incomplete or disappear between runs

Likely causes:

- Source rows changed materially and the persisted finding was updated in place.
- Provider data became stale or was reduced during a later sync.

Actions:

1. Review the underlying imported bills, bank transactions, and supplier evidence for the tenant.
2. Confirm the issue type still has enough evidence to remain active.
3. Treat missing evidence as a data-freshness problem before treating it as a detector bug.

### 4.3 Export returns 403 or no file

Likely causes:

- The tenant lacks the `csv_export` entitlement.
- The requested export scope produced no exportable rows.

Actions:

1. Confirm plan entitlement for `csv_export`.
2. Retry with the dashboard's active module filter removed.
3. If rows exist in the dashboard but export is empty, inspect the export query service path.