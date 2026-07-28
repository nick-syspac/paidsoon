## Why

The dashboard's expandable invoice row shows only a thin summary of each sent reminder
email (stage, date, subject, from-address) and a thin summary of any covering arrangement
(type, scope, status, repayment, target date). A freelancer who wants to see what a
reminder actually said, or the full detail of an arrangement (including every invoice it
covers), has no way to do so in-product. `EmailLog` doesn't even persist the rendered
email body today, so there's nothing to show. This change adds a "click to view full
detail" modal for both email history entries and arrangements, and starts persisting the
actual sent email content so it can be displayed.

## What Changes

- Add `htmlBody` and `textBody` columns to `EmailLog` and persist the actual rendered
  content from `sendFollowUpEmail` at send time.
- Add a reusable `DetailModal` UI component (overlay + close button, closable via button,
  backdrop click, and Escape key).
- Clicking an email history row in `InvoiceTable` opens the modal showing that email's
  subject, from-address, sent date, and full body (HTML rendered safely, with a text
  fallback). Logs sent before this change ships show a "content not available for emails
  sent before this feature" fallback message instead of a body.
- Clicking an arrangement summary line in `InvoiceTable` opens a modal showing full
  arrangement detail: type, status, repayment terms, target date, terms/notes, and the
  complete list of invoices covered by the arrangement (not just the current row's
  invoice).
- Add an API route to fetch full arrangement detail (covered invoices + notes) scoped to
  the requesting user via `withUserContext`, since the dashboard's current invoice query
  does not eagerly load other invoices covered by the same arrangement.
- **BREAKING**: none. Existing inline summaries stay as the collapsed-row view; the modal
  is additive.

## Capabilities

### New Capabilities
- `dashboard-detail-modals`: Modal UI for viewing full email content and full arrangement
  detail from the dashboard invoice table, including the underlying persistence of
  rendered email body content needed to support it.

### Modified Capabilities
- `arrangement-lifecycle`: The dashboard's existing "arrangement is visible" requirement
  gains a new scenario — a freelancer can open a modal from the dashboard to see the full
  arrangement detail, including every invoice it covers.

## Impact

- `prisma/schema.prisma` / new migration: `EmailLog.htmlBody`, `EmailLog.textBody`
  (nullable, for backfill-safety on existing rows).
- `prisma/rls-policies.sql`: no policy change needed (`email_logs` access is already
  scoped via the existing join policy; new columns don't change row visibility).
- `lib/email/send.ts`: persist rendered body alongside the existing `EmailLog.create` call.
- `components/dashboard/InvoiceTable.tsx`: wire up click handlers + new modal component.
- New `components/dashboard/DetailModal.tsx` (or similar) reusable modal.
- New `app/api/arrangements/[id]/route.ts` (or similar) `GET` endpoint for full arrangement
  detail, using `withUserContext`.
- `docs/DDD.md`: document the new `EmailLog` columns and the arrangement detail route.
- Tests: `tests/email-schedule.test.ts` (or a new test file) covering body persistence;
  a new route test for the arrangement detail endpoint.
