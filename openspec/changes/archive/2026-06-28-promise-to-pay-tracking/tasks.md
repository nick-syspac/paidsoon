## 1. Schema and Migration

- [x] 1.1 Add `p2pToken String? @unique @map("p2p_token")` field to `TrackedInvoice` in `prisma/schema.prisma`
- [x] 1.2 Add `PromiseToPay` model to `prisma/schema.prisma` with fields: `id`, `trackedInvoiceId`, `userId`, `promisedPayBy`, `promisedAmount` (Int?), `clientNotes` (String?), `status` (default `'active'`), `breachNotifiedAt` (DateTime?), `createdAt`, `updatedAt`; indexes on `(trackedInvoiceId, createdAt)` and `(status, promisedPayBy)`; relation to `TrackedInvoice`
- [x] 1.3 Run `npx prisma migrate dev --name add-promise-to-pay` to generate the migration
- [x] 1.4 Add RLS policy for `promise_to_pay` table in `prisma/rls-policies.sql` scoped to `userId = auth.uid()`
- [x] 1.5 Run `npm run verify-rls` to confirm RLS isolation holds

## 2. Plan Feature Flag

- [x] 2.1 Set `promise_to_pay_tracking: true` for `business` and `accountant_partner` tiers in `lib/subscriptionPlans.ts`

## 3. Token Generation in Email Send

- [x] 3.1 In `lib/email/send.ts`, add a `generateP2PToken()` helper that returns a 32-byte hex string via `crypto.randomBytes(32).toString('hex')`
- [x] 3.2 In `sendFollowUpEmail()`, after resolving the freelancer's tier, check `hasPlanFeature(tier, 'promise_to_pay_tracking')`; if true, retrieve or generate the `p2pToken` on the invoice (upsert via `prismaAdmin` if null) and pass the token URL to `buildTemplateVars()`
- [x] 3.3 Update `buildTemplateVars()` in `lib/email/templates.ts` to accept an optional `p2pLink?: string` parameter and expose it as `{{promiseToPayLink}}` in the template variable map
- [x] 3.4 Update default stage templates (`DEFAULT_STAGE_1`, `DEFAULT_STAGE_2`, `DEFAULT_STAGE_3`) in `lib/email/templates.ts` to include a conditional `{{promiseToPayLink}}` section in both HTML and text bodies (renders as empty string when not set)

## 4. Public Promise Page and API Route

- [x] 4.1 Create `app/promise/[token]/page.tsx` — public server component; looks up `TrackedInvoice` by `p2pToken` via `prismaAdmin`; renders one of four states: invoice settled, token not found, active promise (show current + update form), or new promise form
- [x] 4.2 Create `app/api/promise/[token]/route.ts` — `POST` handler; validates token, validates `promisedPayBy` is a future date (Zod), supersedes any `active` promises (`status: 'superseded'`), creates new `PromiseToPay` record using `prismaAdmin` (documented RLS bypass — `userId` sourced from DB lookup, not request body), calls `sendP2PNotification('promise_received', ...)`
- [x] 4.3 Add Zod schema for the promise submission body: `{ promisedPayBy: z.string().datetime(), promisedAmount: z.number().int().positive().optional(), clientNotes: z.string().max(500).optional() }`

## 5. Freelancer Notification Emails

- [x] 5.1 Create `sendP2PNotification(type: 'promise_received' | 'promise_broken', invoice: TrackedInvoice, promise: PromiseToPay, freelancerEmail: string, freelancerName: string, brokenCount?: number)` helper in `lib/email/send.ts`
- [x] 5.2 Add HTML and plain-text templates for the `promise_received` email: client name, committed date, optional amount, optional note, dashboard link
- [x] 5.3 Add HTML and plain-text templates for the `promise_broken` email: client name, promised date, optional amount, number of prior broken promises for that client email, dashboard link

## 6. Cron Extensions

- [x] 6.1 In `app/api/cron/send-emails/route.ts`, before the pending invoice query, fetch all `trackedInvoiceId` values with an `active` promise; add `id: { notIn: [...] }` to the existing `findMany` where clause to suppress emails
- [x] 6.2 Add a new cron step (after snooze resumption, before email sending) that queries `PromiseToPay` where `status = 'active'` AND `promisedPayBy < now` AND invoice not in `paid`/`manually_resolved`; for each: set `status = 'broken'`, set `breachNotifiedAt = now`, call `sendP2PNotification('promise_broken', ...)`

## 7. Stripe Connect Webhook — Mark Promise Kept

- [x] 7.1 In `app/api/webhooks/stripe-connect/route.ts`, in the `invoice.paid` handler, after updating the invoice status to `paid`, update any `PromiseToPay` where `trackedInvoiceId = invoice.id AND status = 'active'` to `status: 'kept'`

## 8. Dashboard UI

- [x] 8.1 In `components/dashboard/InvoiceTable.tsx`, query the latest `PromiseToPay` per displayed invoice (join or separate query); add an active-promise badge cell showing the committed date when `status = 'active'`
- [x] 8.2 Add a broken-promise warning cell showing the promise date and a count of prior broken promises for the same `clientEmail` when `status = 'broken'` and no subsequent `active` promise exists

## 9. Tests

- [x] 9.1 Add `tests/promise-to-pay.test.ts` covering: token lookup returns correct invoice, past-date rejection, supersede logic (second promise supersedes first), breach detection eligibility (skips paid/resolved invoices), email suppression logic (active promise means skip), `kept` transition on payment
- [x] 9.2 Update `tests/invoice-state-machine.test.ts` to assert that invoices with active promises are excluded from email eligibility

## 10. Documentation

- [x] 10.1 Update `docs/DDD.md`: add `PromiseToPay` to the data model section, add `/promise/[token]` public page and `POST /api/promise/[token]` to the API routes section, note cron extensions in section 4.4
- [x] 10.2 Confirm no new environment variables are required (no update to `docs/runbooks/README.md` needed)
