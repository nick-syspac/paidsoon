## Context

`components/dashboard/InvoiceTable.tsx` already expands a row to show a compact
"Arrangement" summary and a per-email "Email history" list (stage, sent date, subject,
from-address). Neither shows underlying content: `EmailLog` (`prisma/schema.prisma`)
has no body columns, and the arrangement summary only reflects the single arrangement
tied to the row's invoice — not the full set of invoices it covers (`Arrangement` /
`ArrangementInvoiceCoverage`). `lib/email/send.ts` renders the email (via
`lib/email/templates.ts` or a custom `EmailTemplate`) and sends it, but discards the
rendered body after building the `EmailLog` row.

Dashboard data is loaded server-side in `app/dashboard/page.tsx` via `withUserContext`
and passed to the client `InvoiceTable`. `TrackedInvoice.arrangementCoverages` only
includes coverage rows for that invoice, not sibling invoices under the same
arrangement — fetching the full covered-invoice list requires either an extra
server-side query or a new client-fetched API route.

## Goals / Non-Goals

**Goals:**
- Persist the actual rendered email body (`EmailLog.htmlBody` / `EmailLog.textBody`) at
  send time so it can be displayed later.
- Provide a single reusable, accessible modal component (close button, Escape key,
  backdrop click) used by both the email-detail and arrangement-detail views.
- Let a user click an email history row to see that email's full content.
- Let a user click an arrangement summary to see the arrangement's full detail,
  including every invoice it covers (not just the current row's invoice).
- Keep all new data access scoped through `withUserContext` (no `prismaAdmin` in
  user-facing paths).

**Non-Goals:**
- Backfilling body content for `EmailLog` rows that predate this change (they show a
  fallback message instead).
- Editing/resending an email or modifying an arrangement from the modal — view only.
- Changing the collapsed-row summary UI; the modal is purely additive.
- Retrieving historical email content from Resend's API — we persist our own copy
  instead of depending on a third-party retention window.

## Decisions

1. **Persist body at send time, not on read.** Adding `htmlBody`/`textBody` to
   `EmailLog` and writing them in `sendFollowUpEmail` (`lib/email/send.ts`) guarantees
   the modal shows exactly what was sent, independent of later template edits or
   changed invoice data. Alternative considered: re-render on demand from the current
   template + invoice snapshot — rejected because templates and invoice amounts can
   change after send, so a re-render would misrepresent history.
2. **Nullable columns, fallback UI for old rows.** `htmlBody`/`textBody` are added as
   nullable so the migration needs no backfill. The modal checks for `null` and shows
   "Content not available for emails sent before this feature was added" instead of
   attempting to reconstruct it.
3. **Sanitize HTML before rendering in the modal.** Email HTML bodies are
   freelancer/template-authored but still rendered as `dangerouslySetInnerHTML`-style
   content in a client component; per `security.instructions.md` all such content must
   be sanitized (e.g. a lightweight DOM sanitizer) before render, even though it
   originates from our own templates, since Small Business+ custom templates are
   user-authored HTML (`lib/email/templates.ts`, `EmailTemplate.htmlBody`).
4. **New scoped API route for full arrangement detail.** Rather than eagerly loading
   every sibling invoice for every arrangement on every dashboard page load (most
   arrangements cover 1 invoice), add `GET /api/arrangements/[id]` that returns the
   arrangement plus its full `coverages` (each with the covered invoice's client name,
   amount, and status), scoped via `withUserContext(userId, ...)` and re-validating the
   arrangement's `userId` matches the caller. The modal fetches this lazily on open.
5. **One reusable `DetailModal` component.** Both features need the same shell
   (overlay, focus trap not required for v1, close button, Escape-to-close,
   click-outside-to-close). Building one `components/dashboard/DetailModal.tsx` (or
   `components/ui/`) avoids duplicating overlay/close logic; email and arrangement
   views pass their own body content as children.

## Risks / Trade-offs

- [Risk] Custom (user-authored) `EmailTemplate.htmlBody` content rendered in the modal
  could contain unsafe markup → Mitigation: sanitize before rendering (Decision 3);
  never use raw `dangerouslySetInnerHTML` without sanitization.
- [Risk] New migration adds columns to a frequently-written table (`EmailLog`) →
  Mitigation: columns are nullable with no default backfill, so the migration is an
  additive, low-risk `ALTER TABLE ... ADD COLUMN`.
- [Risk] Arrangement detail route could leak another user's data if the ownership check
  is missed → Mitigation: always resolve the arrangement inside
  `withUserContext(userId, ...)` so RLS enforces the scope, plus an explicit
  `userId` check as defense in depth (consistent with existing `app/api/arrangements`
  route conventions).
- [Trade-off] Storing full HTML/text bodies increases `EmailLog` row size. Accepted:
  email bodies are small (a few KB) and this table's growth is already bounded by
  invoice/reminder volume.

## Migration Plan

1. Add `htmlBody String?` / `textBody String?` to `EmailLog` in `prisma/schema.prisma`;
   run `npx prisma migrate dev --name add_email_log_body`.
2. Update `lib/email/send.ts` to pass the rendered body into `EmailLog.create`.
3. Add the `DetailModal` component and wire it into `InvoiceTable.tsx` for email rows.
4. Add `GET /api/arrangements/[id]` and wire the arrangement modal to fetch it on open.
5. Update `docs/DDD.md` (new `EmailLog` columns, new API route) and run
   `npm run verify-rls` (no RLS policy change expected, but confirm no regression).
6. No rollback complexity: additive columns and a new opt-in UI path; disabling the
   feature would simply mean not rendering the click handlers.

## Open Questions

- None outstanding — content-persistence approach, modal trigger (row click), and
  arrangement modal scope (full covered-invoice list) were confirmed with the user
  before writing this design.
