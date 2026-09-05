## 1. SpendLeak Expense Import Foundations

- [x] 1.1 Define and migrate SpendLeak expense-import persistence schema (batch lifecycle, staging rows, validation errors, and source metadata).
- [x] 1.2 Implement CSV and XLSX parsing, canonical field mapping, and server-side validation for SpendLeak expense imports.
- [x] 1.3 Add tenant-scoped upload, mapping, validate, and commit APIs for SpendLeak expense imports.
- [x] 1.4 Implement idempotent commit behavior from validated expense rows into normalized SpendLeak spend records.

## 2. Owner Review Workflow (MVP Actions)

- [x] 2.1 Extend SpendLeak finding data model and API contract for owner actions: keep, cancel, renegotiate, ignore, and reopen.
- [x] 2.2 Enforce valid action/state transitions and tenant ownership checks for every decision update.
- [x] 2.3 Implement suppression semantics for keep/ignore decisions, including reopening when material evidence changes.
- [x] 2.4 Update finding detail and related SpendLeak UI surfaces to show/apply decision actions and current review outcome.

## 3. Dashboard and Summary Integration

- [x] 3.1 Surface findings originating from expense imports alongside provider-sync findings in SpendLeak modules and lists.
- [x] 3.2 Include decision outcomes in SpendLeak overview/detail presentation so reviewed status is visible without opening raw evidence.
- [x] 3.3 Ensure grounded summaries remain evidence-based when findings come from mixed sources (provider + imports).

## 4. Verification and Release Readiness

- [x] 4.1 Add tests for CSV/XLSX expense import parsing, mapping, validation errors, and idempotent commit.
- [x] 4.2 Add tests for owner action transitions, suppression behavior, and cross-tenant denial.
- [x] 4.3 Add/update integration tests covering dashboard visibility for import-sourced findings and decision outcomes.
- [x] 4.4 Run `openspec validate complete-spendleak-mvp-import-and-workflow --strict` and record readiness for `/opsx:apply`.