# Tasks

## 1. Data model and provider normalization

- [x] 1.1 Add tenant-scoped category, tag, classification, rule, and append-only event models, including source/category tenant constraints and uniqueness; verify with `npx prisma validate` and generated-client checks.
- [x] 1.2 Add normalized transaction direction without changing imported amount or raw-source values; verify schema migration and generated-client checks.
- [x] 1.3 Add RLS policies and grants for each new tenant-owned table, extend cross-tenant fixtures, and run `npm run verify-rls` against the development database.
- [x] 1.4 Normalize Xero, MYOB, and CSV transaction direction and keep verified expense-account fields distinct from cash/bank account fields; add provider mapping tests covering positive Xero spend and MYOB spend/receipt families.
- [x] 1.5 Update the DDD data-model and import-flow documentation for categories, tags, assignment history, direction, and read-only source boundaries; verify links and documented table names against the schema.

## 2. Taxonomy, deterministic resolver, and Jev client

- [x] 2.1 Implement idempotent per-tenant default category provisioning, including reserved `Other`, name uniqueness, rename/merge/retire rules, and the 255 active-option limit; add tests for lifecycle and concurrent provisioning.
- [x] 2.2 Implement tenant-scoped source-account mappings and classification rules with deterministic precedence, conflict-to-review handling, and explicit rule creation from corrections; add resolver tests for precedence, specificity, conflicts, and tenant isolation.
- [x] 2.3 Implement assignment/event writes and category/tag assignment helpers that preserve manual decisions and source records; add tests for single assignment, tag lifecycle, and audit history.
- [x] 2.4 Add the official `@typesafe-ai/sdk` client using a server-only API key and pinned model, validate Choice responses against submitted active category IDs, and add mocked tests for valid, invalid, timeout, 429, and 529 responses without calling TypeSafe from tests.
- [x] 2.5 Build the minimized TypeSafe state and explicit tenant opt-in boundary; add tests proving requests omit source IDs, contact details, references, exact amounts, and raw provider payloads, and verify the opt-out path sends no request.
- [x] 2.6 Add `TYPESAFE_API_KEY` to the environment runbook and document provider processing, US hosting/retention caveats, model pinning, and token-usage monitoring; verify against the official TypeSafe documentation.
- [x] 2.7 Create a 300-500 record synthetic or de-identified, human-reviewed evaluation fixture and a benchmark comparing rules-only with rules-plus-Jev; verify merchant/time holdout separation and report macro-F1, precision, review rate, latency, usage, and estimated cost without storing production transaction content.

## 3. Idempotent import handoff and worker

- [x] 3.1 Enqueue or resolve classifications after Xero/MYOB source upserts using a classification-relevant fingerprint; add tests that unchanged re-imports preserve manual assignments and do not repeat completed Jev requests.
- [x] 3.2 Connect CSV/XLSX spend finalization to the same classification handoff for its existing imported bill/bank transaction records; add commit replay and row-reimport tests.
- [x] 3.3 Implement durable worker claims, a single active-run lease, a 25-record invocation cap, concurrency limit, and fingerprint-checked completion; add tests for concurrent invocations and stale results after source changes.
- [x] 3.4 Implement bounded retry/backoff for network, timeout, 429, and 529 failures and review routing for permanent errors; add tests for retry limits, `Retry-After`, and import success despite Jev failure.
- [x] 3.5 Add a `CRON_SECRET`-guarded classification route and Vercel schedule, plus operational counters that do not log transaction content; verify unauthorized calls return 401 and the configured schedule includes the route.

## 4. Tenant settings and review experience

- [x] 4.1 Add authenticated, Zod-validated APIs for category/tag management, rules, and Jev opt-in using `withUserContext`; add route tests for unauthenticated access, invalid input, and cross-tenant isolation.
- [x] 4.2 Add authenticated review and correction APIs for individual records and explicitly selected bulk confirmation, including per-record audit events and optional future-only rule creation; test that rules are not created implicitly and manual assignments are not overwritten.
- [x] 4.3 Add category-management and external-processing opt-in settings UI with rename, retire, merge, and `Other` protection; verify interaction states, validation messages, and accessibility using the project lint/type checks.
- [x] 4.4 Add the imported-spend review UI showing direction, source traceability, category, origin, confidence/status, matched mapping/rule details, and Jev as a suggestion without fabricated rationale; verify review, correction, and explicit rule-creation flows with lint/type checks.

## 5. FinOps consumers and special cases

- [x] 5.1 Update SpendLeak summaries to group confirmed assignments by shared category and report unclassified/unconfirmed totals separately; add deterministic tests for mixed status, direction, and source traceability.
- [x] 5.2 Update Cost Guard category analysis to include bills and bank transactions using confirmed categories and normalized outflow direction; add route/service tests proving inflows, transfers, unknown direction, and unconfirmed suggestions are not counted as confirmed spend.
- [x] 5.3 Expose confirmed spending category as MarginGuard context without changing `DIRECT_COST`/`VARIABLE_COST`/`OVERHEAD` behavior; add tests proving category and cost class remain independent.
- [x] 5.4 Verify Tax Buffer continues to rely on source tax/GST evidence rather than spending category or Jev confidence; add tests for high-confidence category with missing/ambiguous tax treatment.
- [x] 5.5 Add an audited manual transfer-exclusion action and explicit tenant-scoped refund links; test same-source net credits, cross-source separate credits, unlinked refunds, ambiguous payroll/tax records, and splits without normalized lines, ensuring unsupported cases remain reviewable.

## 6. Integration verification

- [x] 6.1 Run the relevant Node test suite, lint, TypeScript checks, Prisma validation, and OpenSpec strict validation; resolve all change-introduced failures.
- [x] 6.2 Exercise the opt-in flow from provider/CSV import through deterministic resolution, queued Jev suggestion, user correction, re-import, and SpendLeak/Cost Guard category summaries in a seeded test environment; verify no provider write-back and no cross-tenant visibility.
- [x] 6.3 Verify the worker's Vercel schedule, secret configuration documentation, retry observability, and rollback procedure in the deployment runbook before enabling an opted-in tenant.