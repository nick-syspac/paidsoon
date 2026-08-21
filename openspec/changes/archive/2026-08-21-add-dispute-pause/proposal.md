## Why

The public roadmap page (`app/(marketing)/roadmap/page.tsx`) and several marketing pages already advertise "Dispute pause" as a live feature, but it does not exist: `TrackedInvoice.status` has no `disputed` value, and the only artifact referencing this work is a scaffold prompt (`.github/prompts/build-dispute-pause-flow.prompt.md`) explicitly marked "not currently implemented." This is a marketing-claims-ahead-of-reality gap that needs closing before launch, and dispute handling is independently one of the must-have exception-handling paths for the core chase loop.

## What Changes

- New `disputed` value added to `TrackedInvoice.status`, distinct from the existing generic `paused` status, so disputed invoices can be counted and filtered separately from ordinary manual pauses.
- New `disputeNote`, `disputeRaisedAt`, `disputeResolvedAt` fields on `TrackedInvoice`.
- New `POST /api/invoices/[id]/dispute` route: marks an invoice as disputed with an optional note, halting all reminder sends for it (the cron's existing `where: { status: "pending" }` allowlist already excludes any non-`pending` status, so no cron query changes are required).
- New `POST /api/invoices/[id]/resolve-dispute` route: clears dispute fields and returns the invoice to `pending`, recording `disputeResolvedAt`.
- UI: a "Dispute" action in the invoice table, a distinct "Disputed" badge (visually separate from "Paused"), and a small resolution dialog capturing an optional resolution note.
- Marketing correction: no change needed to the roadmap copy once this ships, since "Dispute pause" becomes true; if this change is not prioritized for the current launch window, the roadmap/marketing copy should be corrected in the meantime to stop overstating current functionality (flagged as a follow-up regardless of this change's timing).

## Capabilities

### New Capabilities
- `dispute-pause`: marking an invoice as disputed, halting its reminder sequence, and resolving the dispute back to normal chase behavior

## Impact

- Prisma schema: new `status` enum value + three nullable fields on `TrackedInvoice`; migration required.
- Code touched: new API routes under `app/api/invoices/[id]/`, `components/dashboard/InvoiceTable.tsx` (per the scaffold prompt's own file list), `lib/db/withUserContext.ts` pattern reused as-is.
- No cron changes required (confirmed: `app/api/cron/send-emails/route.ts` filters `where: { status: "pending" }`, an allowlist that already excludes `disputed`).
- Depends on nothing from `add-customer-entity` or `add-invoice-payment-ledger`; can ship independently. `add-needs-attention-queue` depends on this change's `disputed` status existing.
