## 1. Promise Policy Data Model

- [x] 1.1 Add persistence for promise escalation policy (retry limit, escalation threshold, timing toggle, tone toggle) scoped by user
- [x] 1.2 Generate Prisma client updates and create migration for new promise policy model
- [x] 1.3 Add RLS policies for the new promise policy table

## 2. Promise Submission Guardrails

- [x] 2.1 Enforce per-debtor retry-limit checks in public promise submission flow using tenant-scoped broken promise counts
- [x] 2.2 Keep public promise submissions restricted to full-payment commitments and reject unsupported payload structures
- [x] 2.3 Ensure promise rejection messaging clearly directs clients to contact the freelancer when retry limit is reached

## 3. Promise Breach and Escalation Logic

- [x] 3.1 Scope broken-promise counting by tenant and debtor in cron breach notifications
- [x] 3.2 Apply configurable timing escalation for eligible debtors when broken-promise threshold is reached
- [x] 3.3 Apply configurable tone escalation for eligible debtors when broken-promise threshold is reached

## 4. Policy Management API

- [x] 4.1 Add authenticated API endpoint(s) to fetch and update promise escalation policy settings
- [x] 4.2 Validate policy updates with Zod and preserve safe defaults when settings are absent

## 5. Dashboard Promise Priority UX

- [x] 5.1 Add debtor-level broken-promise counts to dashboard data loading
- [x] 5.2 Show broken-promise count and high-priority highlight based on escalation threshold
- [x] 5.3 Keep active and broken promise badges accurate while using debtor-level counts for prioritisation cues

## 6. Testing and Verification

- [x] 6.1 Add tests for promise retry-limit validation and escalation policy parsing
- [x] 6.2 Add tests for cron escalation behavior (tenant-scoped broken counts, timing/tone escalation decisions)
- [x] 6.3 Add tests for dashboard promise-priority helper logic
- [x] 6.4 Run targeted test suites and production build verification
- [x] 6.5 Re-run OpenSpec apply validation and mark all tasks complete