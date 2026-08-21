## 1. Confirm export schema and data dictionary

- [x] 1.1 Finalize the export data dictionary from `design.md` as a shared constant (column keys, order, source, formatting) so CSV and XLSX generation read from one definition
- [x] 1.2 Confirm the `invoice_date` field's provider-dependent availability is reflected in the constant (empty for non-`spreadsheet_import` rows) and not silently defaulted to another date

## 2. Add the shared invoice export filter/query service

- [x] 2.1 Create `lib/invoices/exportQuery.ts` (or equivalent) accepting `{ userId, statusBucket?, overviewFilter?, statuses?, customerId?, provider?, dateField?, dateFrom?, dateTo? }` and returning tenant-scoped invoices (via `withUserContext`) joined with their payments, latest promise-to-pay, and dispute fields
- [x] 2.2 Reuse `filterInvoicesByOverviewCard` for the categorical overview-card filter rather than reimplementing it
- [x] 2.3 Add customer-id and accounting-source (`provider`) filtering, scoped so a filter value from another tenant can never match (query is always additionally scoped by `userId`)
- [x] 2.4 Add date-range filtering restricted to `due_date` and `created_date` fields only (not `invoice_date`), with inclusive from/to bounds
- [x] 2.5 Add unit tests for the filter/query service: status bucket, overview-card filter, customer filter, provider filter, date-range filter, and combinations, including a cross-tenant isolation test

## 3. Implement the export-generation service

- [x] 3.1 Create `lib/invoices/export.ts` mapping a loaded invoice (with joined data) to the documented export row shape, applying the derived-value rules from `design.md` (`outstanding_balance`, `paid_date`, `promise_to_pay_status`/`date`, `dispute_status`, `reminder_status`, `accounting_source`)
- [x] 3.2 Implement the formula-injection sanitiser (leading `'` prefix for user-controlled text fields starting with `=`, `+`, `-`, or `@`) and apply it only to text fields, never to numeric/date/status fields
- [x] 3.3 Implement CSV generation: UTF-8 with BOM, RFC 4180 quoting/escaping (commas, quotes, embedded line breaks preserved), header row matching the data dictionary order
- [x] 3.4 Implement XLSX generation using `xlsx`: worksheet named "Invoices", header row, autofilter over the header range, sensible `!cols` widths, native date/numeric cell types with `#,##0.00`/date number formats (frozen header row is not achievable with the installed SheetJS CE writer — documented cosmetic gap, see design.md)
- [x] 3.5 Implement the row-count safety ceiling with a clear thrown error type the route layer can turn into a user-facing message
- [x] 3.6 Add unit tests: column headings/order, field mapping, date/timestamp/amount/currency/empty-value formatting, Unicode/quotes/commas/multiline handling, formula-injection sanitisation (including that negative amounts and past dates are unaffected), and over-ceiling behavior

## 4. Implement the secure backend export endpoint

- [x] 4.1 Add `GET /api/invoices/export` (or equivalent) accepting `format` (`csv`|`xlsx`) and the filter parameters from the shared query service, validated with Zod
- [x] 4.2 Enforce `requireFeature(userId, "csv_export")` before generating any file; return 403 without touching invoice data if the tier lacks the feature
- [x] 4.3 Derive `userId` only from `supabase.auth.getUser()`, never from request parameters; reject unauthenticated requests
- [x] 4.4 Stream the generated file with the correct `Content-Type` (`text/csv; charset=utf-8` or the XLSX MIME type) and a `Content-Disposition: attachment; filename="paidsoon-invoices-<YYYY-MM-DD>.<ext>"` header
- [x] 4.5 Return a structured error response (no internal details) for invalid format/filters, empty-result cases, and generation failures
- [x] 4.6 Add integration tests: content type, `Content-Disposition` filename, filters applied, no pagination truncation, cross-tenant rejection, unauthenticated/unauthorised rejection, invalid format/filter handling, empty-result handling

## 5. Add the invoices-screen export control

- [x] 5.1 Add an "Export" control to the `/dashboard/invoices` page toolbar, positioned next to the existing "Import invoices" action, offering CSV/XLSX choice
- [x] 5.2 Wire the control to call the export endpoint with the page's currently active status bucket and overview-card filter
- [x] 5.3 Add a generating/loading state that disables the control for the duration of the request and prevents duplicate submissions
- [x] 5.4 Trigger the browser download using the response's filename and show an error message on failure without leaving the control stuck loading
- [x] 5.5 Only render the control when `hasPlanFeature(tier, "csv_export")` is true for the current user; otherwise omit it (or show an upgrade prompt consistent with other gated features on this page)

## 6. Add the settings "Invoice exports" tab

- [x] 6.1 Add an "Invoice exports" tab to `app/dashboard/settings/layout.tsx`'s tab list and create `app/dashboard/settings/export/page.tsx`
- [x] 6.2 Build the advanced export form: format choice, all-invoices-or-date-range toggle, date-field selector (due date / created date) with a caption clarifying invoice-date is exported but not filterable, status filter, customer filter, accounting-source filter
- [x] 6.3 Wire the form to the shared export endpoint/query service; show a generating state and prevent duplicate submissions, matching the dashboard control's behavior
- [x] 6.4 Show an empty-state message when no invoices match the selected filters instead of downloading an empty file
- [x] 6.5 Show a clear, actionable error message on generation/download failure
- [x] 6.6 Gate the entire tab/page behind `csv_export`, redirecting or showing an upgrade prompt for tiers without the feature, consistent with other gated settings screens

## 7. Add permission and observability handling

- [x] 7.1 Confirm `requireFeature`/`hasPlanFeature` is the single source of truth for export permission on both the API route and both UI entry points (no separate role system introduced)
- [x] 7.2 Add a `traceEvent` call around export generation (operation `export_invoices`) recording outcome, format, row count, and filter shape — never raw customer PII — consistent with existing dashboard trace conventions
- [x] 7.3 Remove `csv_export` from `UNIMPLEMENTED_FEATURES` in `lib/subscriptionPlans.ts` and update the pricing-page label logic in `lib/planPresentation.ts`

## 8. Testing

- [ ] 8.1 Add frontend tests for the dashboard Export control: visibility gating by plan, format selection, loading/disabled state, successful download trigger, failure messaging
- [ ] 8.2 Add frontend tests for the Settings "Invoice exports" screen: tab navigation, form filter wiring, empty-state rendering, failure messaging, keyboard/focus and screen-reader label coverage for the format and filter controls
- [x] 8.3 Add an end-to-end-style test (within this repo's Node test runner conventions) covering: request current filtered dashboard view → CSV/XLSX file → correct headers/content-type/filename
- [x] 8.4 Confirm all new tests run under `npm run test` without hitting a real database, Resend, or Stripe, per repository testing conventions

## 9. Documentation

- [x] 9.1 Update `docs/DDD.md` §3 (Domain Model Overview) to add the invoice-export module row
- [x] 9.2 Update `docs/DDD.md` §7 (API Design) with the new export endpoint's request/response contract
- [x] 9.3 Update `docs/DDD.md` §11 (Billing and Entitlements Design) to reflect `csv_export` moving from unimplemented to implemented
- [x] 9.4 Update `docs/DDD.md` §15 (Reporting, Audit and Export Design), replacing "none implemented" with the export pipeline description and its `traceEvent`-based observability
- [x] 9.5 Update `app/(marketing)/pricing/page.tsx` feature-row behavior if any copy is hardcoded beyond the automatic "(coming soon)" suffix logic
- [x] 9.6 Add the export data dictionary as a standalone reference (either inline in `docs/DDD.md` §15 or a linked doc) so it stays discoverable outside this change folder
- [x] 9.7 Add or update in-product help text/tooltips for the new Export button and the "Invoice exports" settings tab (check `content/help/**` and `components/help/**` for the existing pattern)
- [x] 9.8 Add a release-notes entry under `docs/release-notes/` following the existing format once the feature is implemented

## 10. Manual verification

- [ ] 10.1 Manually verify CSV opens correctly with Unicode/special characters intact in Microsoft Excel, Apple Numbers, Google Sheets, and LibreOffice
- [ ] 10.2 Manually verify XLSX opens correctly (autofilter, column widths, date/number types) in the same four applications — frozen header row is a known, documented gap (SheetJS CE writer limitation), not expected to work
- [ ] 10.3 Manually verify a formula-injection payload (e.g. a customer name of `=1+1`) is not executed as a formula when opened in Excel
- [ ] 10.4 Manually verify cross-tenant isolation by attempting to pass another tenant's customer/invoice identifiers as filters and confirming no foreign data is returned
- [ ] 10.5 Manually verify accessibility of both export entry points with keyboard-only navigation and a screen reader
