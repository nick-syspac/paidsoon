## Context

PaidSoon sends automated follow-up emails to overdue invoice clients on behalf of freelancers. Currently, when a client verbally commits to a payment date, the freelancer has no structured way to record it inside PaidSoon. The closest proxy is `snooze`, but that is a unilateral freelancer action with no client involvement and no history. This design covers the full promise-to-pay feature: client-initiated token flow, data model, cron extensions, and notifications.

Constraints from the existing architecture:
- `TrackedInvoice.status` must not grow unboundedly — new states add cost everywhere (cron, dashboard, tests, state machine). The design MUST use metadata, not a new status.
- All user-facing DB writes MUST use `withUserContext` (RLS). The public promise endpoint writes using `prismaAdmin` with explicit scoping — this is a documented RLS bypass (the client has no Supabase session).
- The cron (`app/api/cron/send-emails/route.ts`) is a single sequential function — additions must slot in cleanly without restructuring it.
- Email sending MUST go through `sendFollowUpEmail` (for follow-up emails) or a new dedicated notification helper for P2P-specific emails.
- `promise_to_pay_tracking` is already declared as a feature flag in `subscriptionPlans.ts` (currently `false`) — no new feature name needed.

## Goals / Non-Goals

**Goals:**
- Client can self-commit to a payment date via a link in a follow-up email (no login required)
- Full history of promises per invoice is persisted
- Freelancer is notified when a promise is received and when one is broken
- Automated emails are suppressed while an active promise exists
- Dashboard surface shows active and broken promise states
- Feature is gated to `business` and `accountant_partner` tiers
- Data is structured to enable future AI-based debtor risk scoring without schema changes

**Non-Goals:**
- AI debtor risk scoring (future work — this design only ensures the data is there)
- In-app (push/websocket) notifications — email-only for now
- Partial payment workflows — `promisedAmount` is stored but only used for display; no payment split logic
- Client authentication or accounts — the public page is token-gated, not auth-gated
- SMS or other notification channels

## Decisions

### 1. Metadata layer, not a new status

**Decision**: `PromiseToPay` is a separate model keyed to `TrackedInvoice`. The invoice status stays `pending`. The cron reads an active promise as a suppression signal.

**Alternatives considered**:
- New `promised` status on `TrackedInvoice` — rejected because it ripples through every status-aware path (cron query, dashboard filters, state machine tests, webhook handlers) and the semantic is really "pending + has a promise", not a fundamentally different lifecycle state.
- Snooze extension with a `p2pNote` field — rejected because snooze has no client-initiation path, no history, and no breach detection.

### 2. Stable `p2pToken` on `TrackedInvoice`, not per-email-send

**Decision**: A single `p2pToken` field (unique, nullable) on `TrackedInvoice`. Generated on first Business+ email send for that invoice, then reused across all subsequent emails.

**Rationale**: The client sees the same link across all reminder emails. Submitting a new promise supersedes the old one. The token is stable even if the invoice gets re-snoozed, paused, and resumed.

**Alternatives considered**:
- Per-email-send tokens — more security isolation but generates orphaned tokens for every email and confuses clients who click an older email's link.
- Per-client-email tokens — not useful because there's no persistent client identity model.

**Security note**: The token is a 32-byte cryptographically random hex string. It is stored in plain text (it's an access token, not a secret; compromise only allows submitting a payment commitment on someone else's behalf — not reading PII or making payments). Token rotation is not implemented in v1.

### 3. Promise breach detection is cron-only

**Decision**: Broken promises are detected during the daily cron run, not in real time.

**Rationale**: The cron already runs at 09:00 UTC daily. Adding breach detection there is the simplest path. A promise broken at 11pm is notified by 09:00 the next day — acceptable latency for this domain.

**Alternatives considered**:
- Dedicated scheduled job — over-engineered for v1 given the existing cron.
- Real-time check on payment events — would only handle the "kept" case, not "broken".

### 4. `prismaAdmin` for the public promise endpoint

**Decision**: `POST /api/promise/[token]` uses `prismaAdmin` (not `withUserContext`) with the `userId` sourced from the looked-up `TrackedInvoice`, not from a request body or session.

**Rationale**: The client has no Supabase session. `withUserContext` requires a JWT-derived `userId`. Using `prismaAdmin` with a looked-up, DB-sourced `userId` is equivalent to RLS for this single-table write. This is a documented RLS bypass per project conventions.

### 5. Freelancer notifications via dedicated email helpers, not `sendFollowUpEmail`

**Decision**: Two new notification emails (promise received, promise broken) are sent via a new `sendP2PNotification()` helper in `lib/email/send.ts`, not via `sendFollowUpEmail`.

**Rationale**: `sendFollowUpEmail` is scoped to the client-facing invoice sequence (stage 1/2/3). P2P notifications go to the freelancer, not the client, and have no stage or `EmailLog` entry. Sharing the function would require awkward parameter gymnastics.

### 6. `kept` status on PromiseToPay set by the Stripe webhook

**Decision**: When `invoice.paid` fires in the Stripe Connect webhook, any `active` promise for that invoice is updated to `kept`.

**Rationale**: The webhook already handles the `invoice.paid` event and updates `TrackedInvoice.status = 'paid'`. Adding a `promiseToPay` update there closes the promise lifecycle cleanly without an extra cron step.

## Risks / Trade-offs

- **Token forwarding**: A client forwarding an email to a colleague exposes the P2P link. The worst outcome is an incorrect promise date submitted on the client's behalf. Acceptable for v1; token rotation can be added later.
- **Cron-only breach notification**: A promise that expires at 00:01 won't be flagged until 09:00 the next day. This is an acceptable latency for a daily-cadence product.
- **No deduplication on promise submissions**: A client submitting the form twice quickly creates two `PromiseToPay` records (the first auto-superseded). The Prisma transaction in the POST handler must supersede existing `active` promises atomically.
- **`prismaAdmin` in public endpoint**: Explicit RLS bypass. The endpoint is narrowly scoped — only writes one row to `promise_to_pay` using a `userId` read from the DB, not from user input.
- **History growth**: Over time, a heavily-used invoice could accumulate many `PromiseToPay` rows. Indexes on `(trackedInvoiceId, createdAt)` and `(status, promisedPayBy)` keep queries fast; no archival strategy needed at v1 scale.

## Migration Plan

1. Add `p2pToken` column to `tracked_invoices` (nullable, unique).
2. Add `promise_to_pay` table with all fields.
3. Add RLS policy for `promise_to_pay` (scoped to `userId`).
4. Run `npx prisma migrate deploy` in production.
5. Flip `promise_to_pay_tracking` to `true` in `subscriptionPlans.ts` for `business` and `accountant_partner`.
6. Deploy app code (new public page, route, cron additions, email changes, dashboard changes).

Rollback: flip the feature flag back to `false`. The new columns and table are additive and won't affect existing functionality if the feature is off.

## Open Questions

- Should the client-facing page (`/promise/[token]`) carry the PaidSoon brand prominently, or be minimally branded to feel like it comes from the freelancer? (UX/product decision — no blocking impact on implementation.)
- Should a breach notification email include one-click action links (e.g., `?action=pause&token=...`) to let the freelancer act directly from their inbox, or is a plain dashboard link sufficient for v1?
