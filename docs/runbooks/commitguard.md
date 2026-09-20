# CommitGuard Operations Runbook

This runbook covers CommitGuard commitment tracking, detection review, lifecycle actions, and CashPlan integration for local, preview, and production environments.

Current scope reflects shipped behavior:

- Commitment summary, detection queue, lifecycle actions, timeline, and settings are live.
- CashPlan integration output is live.
- CommitGuard uses shared Tax Buffer, SpendLeak, and Cost Guard signals where available.

## 1. Operational flows

### 1.1 Commitment summary and free-cash calculation

CommitGuard summarizes upcoming commitments, renewal pressure, and free-cash risk.

Primary paths:

- `lib/commitguard/service.ts`
- `lib/commitguard/engine.ts`
- `GET /api/commitguard/summary`
- `GET /api/commitguard/cashplan`

Operational notes:

- Free-cash composition can consume Tax Buffer protected-cash context when available.
- The `/api/commitguard/cashplan` route is the integration-safe contract consumed by CashPlan.

### 1.2 Detection queue and review

Primary paths:

- `lib/commitguard/detection.ts`
- `GET /api/commitguard/detections`
- `POST /api/commitguard/detections/[id]/review`

Review outcomes include confirm, ignore, not-a-commitment, and edit-driven confirmation paths.

### 1.3 Commitment lifecycle and event history

Primary user-facing surfaces:

- `/dashboard/commitguard`
- `/dashboard/settings/commitguard`

Primary routes:

- `GET/POST /api/commitguard/commitments`
- `GET/PATCH /api/commitguard/commitments/[id]`
- `POST /api/commitguard/commitments/[id]/actions`
- `GET /api/commitguard/timeline`
- `GET/PUT /api/commitguard/settings`

Supported lifecycle actions:

- `pause`
- `resume`
- `cancel`
- `confirm`

## 2. Environment variables

CommitGuard introduces no new environment variables and reuses the central matrix in `docs/runbooks/README.md`.

Relevant shared dependencies:

- Existing auth and database configuration.
- Upstream accounting and spend data variables when detections rely on imported/provider data.
- No dedicated module-only cron or internal-job secret is required.

## 3. Operational boundaries

- CommitGuard is the system of record for commitment lifecycle state, not Cost Guard or SpendLeak.
- Detection is deterministic and evidence-based; the queue should not be described as AI-generated.
- CashPlan consumes CommitGuard output, but CommitGuard does not own CashPlan forecast persistence.

## 4. Troubleshooting

### 4.1 Detection queue is empty when recurring spend exists

Likely causes:

- The tenant lacks the `commitguard_detection` feature.
- Source spend evidence is stale or does not meet recurrence and variance thresholds.

Actions:

1. Confirm entitlement for detection features.
2. Review recent SpendLeak or accounting input freshness.
3. Verify the supplier and amount pattern is consistent enough to form a detection candidate.

### 4.2 Free-cash output looks wrong

Likely causes:

- Tax-protected cash context is missing or changed.
- Upcoming commitment dates or amounts are stale.
- The caller is comparing CashPlan and CommitGuard outputs from different refresh points.

Actions:

1. Check current CommitGuard settings and active commitments.
2. Verify whether Tax Buffer context is available for the tenant.
3. Compare `/api/commitguard/summary` and `/api/commitguard/cashplan` outputs from the same point in time.

### 4.3 Lifecycle action fails or appears not to persist

Likely causes:

- The commitment is not in a valid state for the requested action.
- The caller lost ownership context or attempted an out-of-date record transition.

Actions:

1. Reload the commitment detail or dashboard list.
2. Check the current status before retrying `pause`, `resume`, `cancel`, or `confirm`.
3. Review the timeline output to confirm whether the event was already recorded.