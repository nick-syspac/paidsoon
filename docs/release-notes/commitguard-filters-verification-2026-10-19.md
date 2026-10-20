# CommitGuard task 7.3 verification — 2026-10-19

Scope: working-tree implementation of task 7.3 only, not a deployment claim. No task checkboxes changed. No schema, SQL, external database/API, scheduler, provider, billing, or email operations performed. Task 7.4 source-link changes and task 7.5 renewal editing/pagination remain deferred.

## Contract and implementation

- [Shared URL validation and selection](../../lib/commitguard/workspaceFilters.ts): strict Zod enum/string/date/identity validation; empty form values accepted; no boolean/object/array coercion. Safe integer page strings clamp to one and the filtered last page. Fractions, exponent notation, unsafe integers, malformed dates, unknown keys and invalid enums are rejected.
- [Actual loader](../../lib/commitguard/workspaceLoader.ts) returns safe classification/source/link fields and an `upcoming` selection computed before pagination in the existing repeatable-read tenant snapshot. All commitments remain available for mutation controls. Financial totals, candidates, alerts and renewals are not narrowed by upcoming filters.
- [Workspace endpoint](../../app/api/commitguard/workspace/route.ts) preserves authentication/entitlement guards and returns safe 400 errors for invalid or duplicate query keys, including prototype-related keys. Filter text never enters SQL; selection operates on safe tenant snapshot rows.
- [Server page](../../app/dashboard/commitguard/page.tsx), [dashboard](../../components/dashboard/commitguard/CommitGuardDashboard.tsx), and [client refresh](../../lib/commitguard/workspaceClient.ts) share the same validated parameters and coherent DTO. Client refresh verifies that pagination metadata/items match those parameters before publishing.
- [Upcoming controls](../../components/dashboard/commitguard/CommitGuardUpcoming.tsx): labeled search, category, status, essentiality, frequency, source, currency, due period/date range, sort and direction controls. A GET form resets only commitment pagination; hidden relationship/alert navigation remains intact. Previous/next links preserve filters and independent alert pagination. Clear filters removes relationship filters while retaining alert navigation.
- Due dates use saved `nextDueDate`, explicitly labeled UTC, not projected recurrence guesses. Next 7/30/60/90 days and explicit ranges are half-open: inclusive start, exclusive end. The current UTC calendar day anchors relative periods. Overdue and unscheduled are explicit choices. Default statuses are active/upcoming/ending/review; historical/paused/all statuses require explicit selection.
- Legacy `costGuardAlertId` and explicit `linkedSpendInsightId` are accepted and matched by identity. No SpendLeak source links changed. Legacy custom recurrence is offered as a read filter only, never as a new/edit schedule choice. Source-currency amount sorting explicitly says no FX.

## Automated results

- `npm run test`: **3813 passed, 0 failed, 0 skipped**, 311 suites.
- `npm run lint`: **0 errors, 1 existing warning**, unused `isVisible` argument in [settings navigation](../../lib/settings/navigation.ts).
- `npx tsc --noEmit --pretty false`: **48 unrelated existing diagnostics**; 22 generated development-route diagnostics and 26 existing accounting-trigger-sync, DepositGuard, SpendLeak and trial-access test diagnostics. No diagnostics in task 7.3 implementation/tests.
- `git diff --check`: passed.
- Editor diagnostics: no errors in changed production filter/DTO/loader/client/page/route/rendering modules or new filter/loader tests.
- [Actual loader/route/renderer tests](../../tests/commitguard-workspace.test.ts) cover 25 matches across three pages, filtering before paging, unchanged financial surfaces, malicious queries, tenant isolation, source identities, preserved parameters and shrinking-result refresh clamping.
- [Pure filter tests](../../tests/commitguard-workspace-filters.test.ts) cover exact UTC boundaries, empty inputs, strict unknown values, sorting/ties, statuses, encoding and independent pagination.
- [Server-page tests](../../tests/commitguard-page.test.ts) cover safe validation failures and empty-form compatibility. [Client-store tests](../../tests/commitguard-workspace-client.test.ts) reject mismatched selection DTOs without replacing prior coherent state.

## Synthetic browser results

Used the [actual-component synthetic browser harness](../../tests/fixtures/commitguard-workspace-browser.mjs), real compiled application Tailwind CSS, synthetic fetch transport and loopback port 4193. No real Next server, session, database or external API. Router refresh is a recorded stub: this is not authenticated production/RSC acceptance evidence.

- At **375 × 812**, 31 synthetic rows produced **25 software matches**, with **12 / 12 / 1** rows across pages 1/2/3. Both click and focused-link Enter reached the final record.
- `source`, category, sort, `alertPage=3`, legacy CostGuard identity and explicit SpendLeak identity survived navigation.
- Applying a nonmatching search from page 3 removed the commitment `page` parameter, retained the independent parameters, showed **0 matches / page 1 of 1** and an actionable filtered-empty message. No mutation requests occurred.
- Pausing the only row on page 3 performed **one POST + one coherent GET + one recorded router refresh**. The list immediately became **24 matches / page 2 of 2**, with 12 rows and Next disabled. Hero/horizon figures updated and the lifecycle row showed paused. `alertPage=3` remained preserved.
- Document scroll width was **360px** at a **375px** viewport; the commitment table remained inside its **302px** keyboard-focusable horizontal-scroll region. Twelve controls had associated labels. Disabled pagination boundaries were not links.

Renewal truncation remains unchanged for task 7.5. No source-navigation implementation or integration claim is made for task 7.4. No task was checked or archived.