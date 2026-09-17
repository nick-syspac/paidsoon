# Cost Guard Operations Runbook

This runbook covers Cost Guard's read-only baseline, alert, and forecast operations for local, preview, and production environments.

Current scope reflects shipped behavior:

- Cost Guard baseline, rule, forecast, and alert persistence are live.
- Dashboard pages for summary, categories, suppliers, rules, and alerts are live.
- Cost Guard remains read-only and uses shared financial data rather than a separate cost ledger.

## 1. Operational flows

### 1.1 Baseline and forecast evaluation

Cost Guard calculates risk and variance against shared financial inputs.

Primary paths:

- `lib/costGuard/foundation.ts`
- `GET /api/cost-guard/summary`
- `GET /api/cost-guard/forecast`

Operational notes:

- Baselines, rules, alerts, events, and forecast state are tenant-scoped.
- The module is intentionally read-only and should explain cost-risk signals rather than mutate upstream financial records.

### 1.2 Rule, category, supplier, and alert views

Primary user-facing surfaces:

- `/dashboard/cost-guard`
- `/dashboard/cost-guard/categories`
- `/dashboard/cost-guard/suppliers`
- `/dashboard/cost-guard/rules`
- `/dashboard/cost-guard/alerts`

Primary API paths:

- `GET /api/cost-guard/categories`
- `GET /api/cost-guard/suppliers`
- `GET/POST /api/cost-guard/rules`
- `GET /api/cost-guard/alerts`

### 1.3 Alert lifecycle actions

Implemented alert action routes:

- `GET /api/cost-guard/alerts/[id]`
- `POST /api/cost-guard/alerts/[id]/acknowledge`
- `POST /api/cost-guard/alerts/[id]/investigate`
- `POST /api/cost-guard/alerts/[id]/expected`
- `POST /api/cost-guard/alerts/[id]/resolve`
- `POST /api/cost-guard/alerts/[id]/snooze`

Operational notes:

- Cost Guard alerts can deep-link into CommitGuard when a commitment review is the next practical step.
- Alert handling is still tenant-scoped and session-authenticated through the standard application paths.

## 2. Environment variables

Cost Guard introduces no dedicated environment variables and reuses the central matrix in `docs/runbooks/README.md`.

Relevant shared dependencies:

- `CRON_SECRET` when accounting sync freshness affects upstream financial inputs.
- `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET`, `XERO_REDIRECT_URI`
- `MYOB_CLIENT_ID`, `MYOB_CLIENT_SECRET`, `MYOB_REDIRECT_URI`
- `TOKEN_ENCRYPTION_KEY`

Provider setup remains centralized in `supabase.md`, `myob.md`, `vercel.md`, and `railway.md`.

## 3. Operational boundaries

- Cost Guard is read-only and should not be documented as a write-back or procurement workflow.
- No dedicated cron route currently performs Cost Guard-only processing.
- Cross-module deep links into CommitGuard are operational, but CommitGuard remains the system of record for commitment lifecycle actions.

## 4. Troubleshooting

### 4.1 Cost Guard summary is empty or obviously stale

Likely causes:

- Upstream spend or financial inputs are stale.
- The tenant has not accumulated enough categorized history for the baseline to be meaningful.

Actions:

1. Confirm recent accounting sync or import activity.
2. Review whether the tenant has enough historical cost data for baseline generation.
3. Treat missing baseline data as an upstream evidence problem before treating it as an alert rendering issue.

### 4.2 Alerts exist but drill-down views do not line up

Likely causes:

- The alert references an older snapshot or rule context.
- Supplier or category evidence changed after the alert was created.

Actions:

1. Compare the alert with the current forecast and supplier/category views.
2. Check whether the tenant recently changed rules or refreshed imported data.
3. If the discrepancy is expected after refresh, resolve or acknowledge the old alert rather than duplicating it.

### 4.3 CommitGuard deep links from Cost Guard do not help the operator

Likely causes:

- The underlying cost signal is not tied to an active commitment.
- CommitGuard detection has not yet confirmed a matching commitment candidate.

Actions:

1. Confirm whether the Cost Guard alert has related SpendLeak or commitment metadata.
2. Check `/dashboard/commitguard?costGuardAlertId=...` for the filtered view.
3. If no candidate exists, keep the issue in Cost Guard instead of forcing it into CommitGuard.