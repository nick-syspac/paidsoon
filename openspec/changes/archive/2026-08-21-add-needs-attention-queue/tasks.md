## 1. Email delivery tracking

- [x] 1.1 Add `RESEND_WEBHOOK_SECRET` env var and document it in `docs/runbooks/README.md`
- [x] 1.2 Add `POST /api/webhooks/resend/route.ts` verifying the Resend signature before processing, following the existing Stripe webhook verification pattern
- [x] 1.3 Update `EmailLog.status` allowed-values comment to include `delivered`, `bounced`, `complained`
- [x] 1.4 Match incoming webhook events to `EmailLog` rows by `resendMessageId`; update status accordingly
- [x] 1.5 Return success (no error) for events with no matching `EmailLog` row
- [x] 1.6 Add tests for signature verification failure, successful status update, and unmatched-event handling, without hitting the real Resend API

## 2. Needs Attention data assembly

- [x] 2.1 Add a bounced-email count helper reading `EmailLog.status = 'bounced'` per tenant
- [x] 2.2 Add a disputed-invoice count helper reading `TrackedInvoice.status = 'disputed'` (depends on `add-dispute-pause`; returns 0 today since no invoice ever has that status until that change ships)
- [x] 2.3 Add a no-contact-email count helper reading `Customer` rows with an empty `primaryEmail` (depends on `add-customer-entity`; returns 0 today since `findOrCreateCustomer` never persists an empty `primaryEmail`)
- [x] 2.4 Add an import-anomaly count helper reading the anomaly flag from `add-invoice-payment-ledger`'s reconciliation logic (hard-stubbed to 0 — no schema field exists yet for this signal)
- [x] 2.5 Add a 60+ day overdue count derived from `ageing.ts`'s existing `d61to90`/`d90plus` buckets

## 3. Restructure the Needs Attention widget

- [x] 3.1 Replace `attentionRequired.ts`'s flat `AttentionItem` list with a category-grouped count structure covering all six categories
- [x] 3.2 ~~Fold the existing three rules...~~ **Deviation (user-approved):** the three legacy rules (exhausted-reminders-no-promise, promise-expiring-soon, unusually-large-invoice) were dropped rather than folded in, since the proposal's headline category list only names the six categories above. User explicitly chose "6 categories only" when asked. `design.md`'s Non-Goals wording should be amended in a follow-up if this needs to be reconciled.
- [x] 3.3 Make each category link through to a filtered invoice/customer view
- [x] 3.4 Update `app/dashboard/page.tsx` to render the new grouped queue

## 4. Overview cards

- [x] 4.1 Add `disputed` and `bounced` traffic-light cards to `lib/dashboard/overviewCards.ts`, matching the existing severity-derivation pattern used for `broken_promises`/`held_invoices`

## 5. Docs

- [x] 5.1 Update `docs/DDD.md` with the new webhook route and `EmailLog` status values
