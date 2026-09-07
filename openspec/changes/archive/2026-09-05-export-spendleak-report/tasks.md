## 1. Scope and schema decisions

- [x] 1.1 Confirm entitlement model for SpendLeak report export (`csv_export` reuse vs dedicated feature flag).
- [x] 1.2 Finalize the SpendLeak report field dictionary (keys, headers, order, type formatting, required vs optional).
- [x] 1.3 Finalize current-filter parameter contract for dashboard-triggered exports.

## 2. Shared query and mapping layer

- [x] 2.1 Create a tenant-scoped SpendLeak export query service that loads only findings represented by the current filter state.
- [x] 2.2 Add deterministic mapping from finding + evidence into the report row shape.
- [x] 2.3 Implement status/action presentation mapping for `spendleak_status` and review outcomes.
- [x] 2.4 Add best-effort extraction for category, confidence, and source references with empty-value fallback.

## 3. File generation and endpoint

- [x] 3.1 Implement shared CSV/XLSX generation for SpendLeak report rows using one field dictionary.
- [x] 3.2 Add spreadsheet-formula sanitization on string fields.
- [x] 3.3 Add row-limit guardrails and actionable errors for oversized exports.
- [x] 3.4 Add authenticated `GET /api/spendleak/export` (or equivalent) with Zod validation and tenant-safe access checks.

## 4. Product surface integration

- [x] 4.1 Add an "Export SpendLeak Report" action on the SpendLeak dashboard.
- [x] 4.2 Wire active dashboard filter state into export query parameters.
- [x] 4.3 Add user-facing copy clarifying analysis-only scope (not accounting import/export).

## 5. Verification and documentation

- [x] 5.1 Add tests for route auth, tenant isolation, filter-respecting row selection, and schema ordering.
- [x] 5.2 Add tests for CSV/XLSX parity and spreadsheet-formula sanitization.
- [x] 5.3 Update docs/DDD.md with route and report data dictionary once implemented.
- [x] 5.4 Run `openspec validate export-spendleak-report --type change --strict` and record readiness.
