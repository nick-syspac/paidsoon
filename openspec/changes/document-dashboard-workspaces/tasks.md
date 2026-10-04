# Tasks

## 1. Dashboard guide

- [x] 1.1 Add `docs/user/dashboard.md` covering Overview, Invoices, Resolved Invoices, Owner's Digest, DepositGuard, CommitGuard, Cost Guard, MarginGuard, RunwayGuard, Tax Buffer, and SpendLeak; verify each section names its purpose, current dashboard route where applicable, key navigation/actions, and a relevant existing guide link.
- [x] 1.2 Document Overview as a triage summary, distinguish InvoiceGuard settings from active/resolved invoice lists, and explain active versus resolved invoice records/actions; verify descriptions against the current dashboard pages and avoid presenting the overview as a complete ledger.
- [x] 1.3 State conditional access and source-data caveats, including Cost Guard sample-like values, RunwayGuard forecast limitations, and Tax Buffer estimates; verify these warnings match the existing focused guides and do not promise every module is available to every plan.

## 2. Manual navigation and review

- [x] 2.1 Update `docs/user/index.md` with a clear link and reading path to the dashboard guide; verify its relative link resolves and the guide remains distinct from in-app Help Centre content.
- [x] 2.2 Review all dashboard-guide routes and relative links against current navigation, pages, and existing guides; run `git diff --check` and verify only `docs/user/dashboard.md` and `docs/user/index.md` are changed by implementation.
