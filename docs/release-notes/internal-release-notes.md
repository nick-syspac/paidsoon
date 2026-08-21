# PaidSoon Internal Release Notes

This file is internal-only and chronological, with newest releases first.
Use it as the engineering source of truth for each release.

## Release v0.3.0 - 2026-08-11

- Internal reference ID: REL-2026-08-11-v0.3.0
- Release owner: Engineering
- Deployment window: 2026-08-11 09:00-10:00 UTC
- Risk level: low

### Executive Summary
This release adds invoice export (CSV/XLSX) for Small Business and Accountant Partner tenants, gated by the existing `csv_export` feature flag. No breaking API contract changes. Rollout is immediate for the private beta environment.

### Scope Included
- New `GET /api/invoices/export` route (Zod-validated, `requireFeature("csv_export")`-gated, tenant-scoped via `withUserContext`).
- Shared filter/query service (`lib/invoices/exportQuery.ts`) and export-generation service (`lib/invoices/export.ts`) with a formula-injection sanitiser and a 50,000-row safety ceiling.
- Dashboard "Export" toolbar control and a new Settings → Invoice exports advanced-filter screen.
- `csv_export` moved out of `UNIMPLEMENTED_FEATURES` in `lib/subscriptionPlans.ts`; pricing page now shows it as available on Small Business+ rather than "coming soon".

### Deferred
- Frontend/component-level tests for the new Export UI (this repo has no React component test infrastructure — Node's built-in test runner covers the API route and library logic only; adding Jest/RTL would require a separate discussion per repo policy).
- Manual cross-application verification (Excel/Numbers/Sheets/LibreOffice, screen reader) — see openspec/changes/add-invoice-export/tasks.md Group 10.

### Technical Changes
- New modules: `lib/invoices/exportFields.ts`, `lib/invoices/exportQuery.ts`, `lib/invoices/export.ts`, `app/api/invoices/export/route.ts`, `components/dashboard/InvoiceExportButton.tsx`, `components/settings/InvoiceExportClient.tsx`, `app/dashboard/settings/export/page.tsx`.
- Extracted `lib/dashboard/invoiceStatusLabels.ts` so `InvoiceTable.tsx` and the export service share one set of status/stage labels.
- Confirmed via direct inspection of the installed `xlsx@0.18.5` (SheetJS Community Edition) writer source that frozen panes are not serialised by this library version — documented as a known cosmetic gap rather than silently dropped.

### Database and Migration Notes
- Prisma schema change: no.
- Migration required: no.
- Backfill required: no.
- Rollback impact: low.

### Security Notes
- Export permission is enforced server-side via `requireFeature(userId, "csv_export")`, deriving `userId` only from `supabase.auth.getUser()`.
- All export queries run inside `withUserContext` so RLS scopes results to the requesting tenant; a customer/provider filter for another tenant's data matches nothing rather than erroring.
- User-controlled text fields (customer name/email) are sanitised against formula injection (leading `'` prefix) before being written to CSV/XLSX.

### Operational Notes
- Feature flags changed: `csv_export` moved from unimplemented to implemented in `lib/subscriptionPlans.ts`.
- Cron schedule changed: no.
- Runbook updates required: no.
- Support briefing required: low-touch note on the new Export control and Settings tab.

## Release v0.2.0 - 2026-08-04

- Internal reference ID: REL-2026-08-04-v0.2.0
- Release owner: Engineering
- Deployment window: 2026-08-04 09:00-10:00 UTC
- Risk level: medium

### Executive Summary
This release improves reliability and clarity across invoice follow-up workflows, with tighter validation and clearer dashboard status handling. No externally breaking API contracts are expected. Rollout is immediate for the private beta environment.

### Scope Included
- Promise-to-pay and reminder-state clarity improvements.
- Dashboard status wording and presentation updates.
- Reliability hardening around reminder update paths.

### Deferred
- Public API and webhook documentation publication.
- Full MYOB Business production validation completion.

### Technical Changes
- Updated marketing-facing release-notes documentation process and structure.
- Refined follow-up and arrangement workflow behavior for clearer state transitions.
- Improved server-side validation around reminder and arrangement mutations.

### Database and Migration Notes
- Prisma schema change: no.
- Migration required: no.
- Backfill required: no.
- Rollback impact: low.

### Security Notes
- Validation hardening reduces invalid state transition risk on user-triggered update paths.
- No new secrets, credentials, or sensitive config exposure introduced.

### Operational Notes
- Feature flags changed: none.
- Cron schedule changed: no.
- Runbook updates required: no.
- Support briefing required: low-touch note on updated status wording.

### Testing and Verification
- Build validation: required before release.
- Test suite: required before release.
- Lint: required before release.
- Manual QA focus:
  - Dashboard status readability
  - Promise-to-pay state transitions
  - Manual resolve and reminder pause/resume behavior

### Incidents and Reversions
- None during release window.

### Breaking or Behavioral Changes
- Breaking changes: none.
- Behavioral change: status wording and presentation updates in dashboard views.

### Post-Release Tasks
- Owner: Product and Engineering
- Due: 2026-08-11
- Status: Open
- Tasks:
  - Confirm support team has updated customer-facing wording references.
  - Continue MYOB Business go-live validation checklist.

---

## Release Template

Copy this template for each new release and place it above older entries.

## Release vX.Y.Z - YYYY-MM-DD

- Internal reference ID: REL-YYYY-MM-DD-vX.Y.Z
- Release owner: <name or team>
- Deployment window: YYYY-MM-DD HH:MM-HH:MM UTC
- Risk level: low | medium | high

### Executive Summary
Two to four sentences covering scope and risk.

### Scope Included
- Item

### Deferred
- Item

### Technical Changes
- Item

### Database and Migration Notes
- Prisma schema change: yes | no
- Migration required: yes | no
- Backfill required: yes | no
- Rollback impact: low | medium | high

### Security Notes
- Item

### Operational Notes
- Feature flags changed: none | list
- Cron schedule changed: yes | no
- Runbook updates required: yes | no
- Support briefing required: yes | no

### Testing and Verification
- Build validation: pass | fail
- Test suite: pass | fail
- Lint: pass | fail
- Manual QA focus:
  - Item

### Incidents and Reversions
- Item or None

### Breaking or Behavioral Changes
- Item or None

### Post-Release Tasks
- Owner: <name or team>
- Due: YYYY-MM-DD
- Status: Open | Closed
- Tasks:
  - Item
