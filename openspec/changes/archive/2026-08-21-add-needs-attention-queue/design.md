## Context

See proposal.md - Why. Today's dashboard already renders, in order: `overviewCards` (traffic-light cards), per-currency KPI/ageing/debtor summaries, and `attentionItems` from `attentionRequired.ts` (see `app/dashboard/page.tsx`). This is not new real estate to design from scratch - it's a restructuring of an existing, shipped section. `ageing.ts` already computes `d61to90`/`d90plus` buckets, so the 60+ day count for this queue is a rollup of data already computed for the ageing chart, not a new computation.

## Goals / Non-Goals

**Goals:**
- Replace the flat ranked-message format with category-grouped counts (resolving the open format question from exploration in favor of counts, since a flat list doesn't scale past ~4 categories without arbitrarily dropping some).
- Reuse existing computed data wherever possible (ageing buckets, broken-promise counts) rather than recomputing.
- Keep the existing severity-card pattern (`overviewCards.ts`) consistent by adding disputed/bounced as new cards alongside the new queue.

**Non-Goals:**
- No change to the *other* three existing `attentionRequired.ts` rules (exhausted-reminders-no-promise, promise-expiring-soon, unusually-large-invoice) beyond folding them into the new grouped format - their underlying logic is unchanged.
- No real-time webhook-driven dashboard updates - bounce/delivery status is reflected on next page load, not pushed live.
- No retry/resend action from the bounced-email category in this change - surfacing the bounce is in scope, an automated "resend" action is not.

## Decisions

- **Category-count format, replacing the flat ranked list.** Resolves the open question from exploration. A flat top-6 message list was workable at 4 categories but doesn't scale to 6+ without silently hiding categories behind the cap, which is the opposite of what a triage queue needs to guarantee (every category should always be visible, even at zero). Alternative considered: keep the flat list and just add more message types - rejected because it reintroduces the same "some real problem gets pushed off the visible top-6" failure mode the count format avoids by construction.
- **60+ day count reuses `ageing.ts` buckets (`d61to90.count + d90plus.count`) rather than a new day-count computation.** Keeps a single source of truth for "how overdue is this invoice" shared with the ageing chart, so the two numbers on the same page can't disagree.
- **Resend webhook signature verification follows the existing Stripe webhook pattern** (verify before touching any data, generic rejection response on failure) rather than inventing a new verification approach, per the project's webhook security convention.
- **Unmatched webhook events return success, not an error.** Resend may retry webhook delivery on non-2xx responses; treating an unmatched message ID as a hard error would cause needless retries for events this system has no record to update (e.g. events for emails sent before this change shipped, which have no `resendMessageId` correlation path older than this change... actually all `EmailLog` rows already store `resendMessageId`, so this only applies to malformed/unexpected events).

## Risks / Trade-offs

- [Restructuring `AttentionItem`'s shape is a breaking change for the one existing consumer (`app/dashboard/page.tsx`)] → single call site, updated in the same change; no external API contract is affected.
- [The bounced-email category requires `add-invoice-payment-ledger`'s reconciliation-anomaly flag and `add-customer-entity`'s no-contact-email signal to exist first] → sequencing is explicit: this change is last in the four-change series and depends on the other three shipping first.
- [Resend webhook retries could arrive out of order (e.g. a `bounced` event after a later `delivered` event for a different attempt)] → out of scope for this change's correctness guarantees; `EmailLog.status` reflects the most recently processed event, not necessarily the most recent by send time. Acceptable for v1 since bounce/delivery status is informational, not used to gate any automated decision.

## Migration Plan

1. Add `RESEND_WEBHOOK_SECRET` env var; document in `docs/runbooks/README.md`.
2. Add `POST /api/webhooks/resend` with signature verification and `EmailLog` status updates.
3. Restructure `attentionRequired.ts` into category-grouped counts, reusing `ageing.ts` bucket data for the 60+ day category.
4. Add disputed/bounced traffic-light cards to `overviewCards.ts`.
5. Update `app/dashboard/page.tsx` to render the new grouped-count queue in place of the flat message list.
6. Rollback: webhook route can be disabled independently (an unconfigured `RESEND_WEBHOOK_SECRET` should fail closed, not fail open) without affecting the rest of the dashboard; the queue restructuring is UI-only and has no data-migration to reverse.
