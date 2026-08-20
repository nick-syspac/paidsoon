## 1. Email delivery tracking

- [ ] 1.1 Add `RESEND_WEBHOOK_SECRET` env var and document it in `docs/runbooks/README.md`
- [ ] 1.2 Add `POST /api/webhooks/resend/route.ts` verifying the Resend signature before processing, following the existing Stripe webhook verification pattern
- [ ] 1.3 Update `EmailLog.status` allowed-values comment to include `delivered`, `bounced`, `complained`
- [ ] 1.4 Match incoming webhook events to `EmailLog` rows by `resendMessageId`; update status accordingly
- [ ] 1.5 Return success (no error) for events with no matching `EmailLog` row
- [ ] 1.6 Add tests for signature verification failure, successful status update, and unmatched-event handling, without hitting the real Resend API

## 2. Needs Attention data assembly

- [ ] 2.1 Add a bounced-email count helper reading `EmailLog.status = 'bounced'` per tenant
- [ ] 2.2 Add a disputed-invoice count helper reading `TrackedInvoice.status = 'disputed'` (depends on `add-dispute-pause`)
- [ ] 2.3 Add a no-contact-email count helper reading `Customer` rows with an empty `primaryEmail` (depends on `add-customer-entity`)
- [ ] 2.4 Add an import-anomaly count helper reading the anomaly flag from `add-invoice-payment-ledger`'s reconciliation logic
- [ ] 2.5 Add a 60+ day overdue count derived from `ageing.ts`'s existing `d61to90`/`d90plus` buckets

## 3. Restructure the Needs Attention widget

- [ ] 3.1 Replace `attentionRequired.ts`'s flat `AttentionItem` list with a category-grouped count structure covering all six categories
- [ ] 3.2 Fold the existing three rules (exhausted-reminders, promise-expiring-soon, unusually-large-invoice) into the new grouped structure without changing their underlying logic
- [ ] 3.3 Make each category link through to a filtered invoice/customer view
- [ ] 3.4 Update `app/dashboard/page.tsx` to render the new grouped queue

## 4. Overview cards

- [ ] 4.1 Add `disputed` and `bounced` traffic-light cards to `lib/dashboard/overviewCards.ts`, matching the existing severity-derivation pattern used for `broken_promises`/`held_invoices`

## 5. Docs

- [ ] 5.1 Update `docs/DDD.md` with the new webhook route and `EmailLog` status values
