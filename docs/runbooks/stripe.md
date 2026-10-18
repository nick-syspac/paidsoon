# Stripe runbook

Stripe is used **twice** in PaidSoon, for two unrelated purposes:

1. **Stripe Billing** — your customers pay for one of the paid public tiers (Essentials, Business Control, Small Business, Business Pro) on your own Stripe account.
2. **Stripe Connect** — your customers connect *their* Stripe accounts so the app can read *their* invoices and act on them.

Both halves use the same Stripe account, but they have separate API surfaces, separate webhook endpoints, and separate config items in the dashboard.

> Env-var values come from [README.md](./README.md) — set them in the environment named in each row.

**Prerequisites:** §5 and §6 (webhook registration) require a live Vercel deployment URL. Do those after [vercel.md](./vercel.md). Everything else can run before Vercel.

> **Critical path**: Stripe Connect platform approval (§4) is an async human review — 1 to 5 business days. **Submit it on day 1** and work through the rest of this runbook (and the others) while you wait.

---

## 1. Test mode vs live mode

Stripe has two parallel modes inside the same account, toggled in the **top-right of the dashboard**:

```
   ┌────────────────────────────────────┐
   │   Stripe Dashboard                 │
   │                                    │
   │              [ test ] [ live ]  ←  ← toggle here
   │                                    │
   └────────────────────────────────────┘
```

Each mode has its own:

- API keys (`sk_test_…` vs `sk_live_…`)
- Products and prices (test-mode prices ≠ live-mode prices)
- Connect Client ID (`ca_…`)
- Webhook endpoints and signing secrets

| App environment | Stripe mode |
|---|---|
| Local | test |
| Vercel Preview | test (shared with Local) |
| Production | live |

When you create something in test mode, **stay in test mode** until you do the production setup. Switching modes mid-flow is a common source of "why doesn't my checkout button work" mistakes.

Every section below tells you which mode it applies to.

---

## 2. API keys

Stripe dashboard → **Developers → API keys**, in each mode you intend to use:

| Stripe field | App env var |
|---|---|
| Secret key | `STRIPE_SECRET_KEY` |

Test mode keys start with `sk_test_…`, live mode with `sk_live_…`. Set per the matrix in [README.md](./README.md).

> **`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is not used.** This app does not run Stripe.js in the browser; checkout is server-driven via `stripe.checkout.sessions.create` ([app/api/billing/checkout/route.ts](../../app/api/billing/checkout/route.ts)). Do not set this env var — it has no effect and will confuse future readers.

---

## 3. Create the billing products

Stripe dashboard → **Products → Add product**. Do this in **both modes** (test for Local/Preview, live for Production).

- **Name**: `PaidSoon Essentials`
- **Pricing**: Recurring, monthly, **A$15.00 / month, inclusive of GST**
- **Tax behavior**: set to **Inclusive** when creating the Price. `tax_behavior` is immutable once set — if it is left `Unspecified` or set to `Exclusive`, Stripe Checkout will add GST on top of the advertised price, and the only fix is creating a new Price object (the existing one cannot be edited). Verify this before capturing the Price ID.

Save, then copy the **Price ID** (starts with `price_…`) and capture it as `STRIPE_STARTER_PRICE_ID` per the matrix.

Set `STRIPE_TRIAL_PERIOD_DAYS` (default `14`) in each environment. This value
is applied by checkout via `subscription_data.trial_period_days` for eligible
self-serve plans.

Repeat for the other paid tiers (same Inclusive tax behavior applies to both):

- **Name**: `PaidSoon Business Control`
- **Pricing**: Recurring, monthly, **A$29.00 / month, inclusive of GST**
- Capture the Price ID as `STRIPE_SOLO_PRICE_ID`

- **Name**: `PaidSoon Small Business`
- **Pricing**: Recurring, monthly, **A$69.00 / month, inclusive of GST**
- Capture the Price ID as `STRIPE_SMALL_BUSINESS_PRICE_ID`

- **Name**: `PaidSoon Business Pro`
- **Pricing**: Recurring, monthly, **A$149.00 / month, inclusive of GST**
- Capture the Price ID as `STRIPE_BUSINESS_PRO_PRICE_ID`

These are the four canonical Price IDs, read by [app/api/billing/checkout/route.ts](../../app/api/billing/checkout/route.ts) and [app/api/billing/downgrade/route.ts](../../app/api/billing/downgrade/route.ts). There is no legacy Pro/Solo fallback variable — `STRIPE_BUSINESS_PRICE_ID` and `STRIPE_PRO_PRICE_ID` have been retired.

---

## 4. Stripe Connect platform

PaidSoon reads invoices from *other people's* Stripe accounts via Connect. You need to be approved as a Connect platform first.

### 4.1 Submit the application — do this on day 1

Stripe dashboard → **Connect → Get started**:

- Select **"Build a platform or marketplace"**.
- Fill in the platform questions (your business model is "read invoices on behalf of users; do not move money").
- Submit.

⚠️ Approval takes **1–5 business days**. Nothing else in this runbook is blocked by it (you can proceed through Supabase, Vercel, Resend), but §4.2, §6, and the end-to-end test in [vercel.md](./vercel.md) all wait on approval.

### 4.2 After approval — get the Connect Client ID

Stripe dashboard → **Connect → Settings → Integration**:

- Account type: **Standard** (simplest — your users keep using their own Stripe dashboard).
- Copy the **Client ID** (starts with `ca_…`) → capture as `STRIPE_CONNECT_CLIENT_ID` per the matrix.

Test mode and live mode have **different** Client IDs. Make sure the right one ends up in the right env.

### 4.3 OAuth Redirect URIs

In the same **Connect → Settings → Integration** screen, add every OAuth Redirect URI the app uses:

| URI | Used by |
|---|---|
| `http://localhost:3000/api/stripe/connect/callback` | Local |
| `https://paidsoon.com/api/stripe/connect/callback` | Production |

Both URIs must be present (Stripe accepts only registered URIs). For Vercel Preview deploys we deliberately do **not** register per-PR URIs — the Connect OAuth flow on a preview deploy will fail because Stripe won't accept the preview URL. Test Connect locally instead.

The URI is constructed in [app/api/stripe/connect/authorize/route.ts L20](../../app/api/stripe/connect/authorize/route.ts#L20).

---

## 5. Stripe Billing webhook

This receives events about *your own* subscriptions (when a user upgrades, cancels, etc.).

### 5.1 Live mode (Production)

**Prerequisite**: [vercel.md](./vercel.md) is done and the production deploy is live.

Stripe dashboard → **Developers → Webhooks → Add endpoint** (in **live mode**):

| Field | Value |
|---|---|
| **Endpoint URL** | `https://paidsoon.com/api/webhooks/stripe-billing` |
| **Listen to** | Events on your account |
| **API version** | `2026-05-27.dahlia` (keep the application pin; no Trial Offer upgrade) |
| **Events** | Exactly the events in the table below; verify subscriptions in each authorized endpoint's Dashboard configuration |

Copy the **Signing secret** (`whsec_…`) → capture as `STRIPE_BILLING_WEBHOOK_SECRET` per the matrix.

The following is the exhaustive handled-event inventory in the current working
change's [billing webhook](../../app/api/webhooks/stripe-billing/route.ts).
Journal/risk reconciliation is **in progress, not rolled out**; follow the
[deployment gate](./vercel.md#12-trial-access-and-customer-billing-journal-release-gate)
before enabling the new handlers against a database. This inventory is not proof
that Dashboard event subscriptions have been configured.

| Event | Effect |
|---|---|
| `checkout.session.completed` | Retrieves completed session/current subscription through the shared hosted lifecycle verifier; creation alone is not completion proof |
| `customer.subscription.created` | Retrieves and projects verified current lifecycle/binding/price/period/trial values |
| `customer.subscription.updated` | Same current-state reconciliation; delivered timestamps alone cannot order direct writes |
| `customer.subscription.deleted` | Confirms current binding/cancellation; preserves independent grants/risk and avoids base-tier invoice side effects for eligible grant access |
| `subscription_schedule.released` | Verifies schedule release and current binding before clearing pending downgrade; release is not subscription cancellation |
| `invoice.payment_failed` | Retrieves the specific subscription invoice, records its risk and reconciles actual current subscription state; event name alone does not synthesize `past_due` |
| `invoice.paid`, `invoice.payment_succeeded` | Retrieves that invoice; clears only its verified resolved fact, never an unrelated invoice/dispute |
| `invoice.updated`, `invoice.finalized` | Retrieves current invoice status/outstanding balance and reconciles its independently scoped risk |
| `invoice.marked_uncollectible`, `invoice.voided` | Uncollectible debt blocks grants; verified void resolves only that invoice fact |
| `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed` | Retrieves dispute → charge → invoice/payment mapping → PaidSoon subscription; records independent dispute risk, including historical canceled subscriptions |
| `customer.subscription.trial_will_end` | Recorded for operational visibility; no direct entitlement change |

Relative to the previous seven-event setup, add `subscription_schedule.released`,
`invoice.payment_succeeded`, `invoice.updated`, `invoice.finalized`,
`invoice.marked_uncollectible`, `invoice.voided` and all three dispute events above.
The invoice/dispute branches skip connected-account events; these are platform
subscription obligations, not debtor/Connect disputes. Do not add unrelated
`billing_portal.session.created`, `subscription_schedule.updated` or async Checkout
events as if this route handled them. Connect registration in §6 is unchanged.

Verify the raw-body `stripe-signature` using `STRIPE_BILLING_WEBHOOK_SECRET`
before receipt persistence. Invalid signature returns 400. Terminal ledger
duplicates return 200 with `deduped: true`; receipt alone is not terminal work.
Busy claims, failed/interrupted processing and unavailable verification return
503 `{error: "Billing reconciliation unavailable"}` with `Retry-After: 60`.
The fenced ledger states are `received/processing/processed/skipped/failed`, with
`processingToken` and a 60-second `processingLeaseUntil`. Redelivery can reclaim
failed/expired processing, but cannot commit through a stale claim. Never delete
receipt rows or mark failures processed merely to suppress retries.

### 5.2 Local — Stripe CLI

You cannot receive webhooks at `localhost` directly. Use the [Stripe CLI](https://stripe.com/docs/stripe-cli):

```bash
# One-time install (macOS):
brew install stripe/stripe-cli/stripe

# One-time login:
stripe login

# Forward billing events to the local dev server:
stripe listen --forward-to localhost:3000/api/webhooks/stripe-billing
```

The CLI prints a `whsec_…` secret on startup — **this is different from the dashboard secret**. Put the CLI secret in your local `.env.local` as `STRIPE_BILLING_WEBHOOK_SECRET`. Keep the CLI running while developing.

The following legacy CLI fixtures are examples, not the exhaustive subscriptions
in §5 or sufficient risk/lifecycle proof. Run only against an authorized isolated
test account/database after the release gates; unrelated generated fixtures can
fail current customer/subscription mapping. Added invoice/dispute/schedule
scenarios require correlated test objects and verified current evidence.

```bash
stripe trigger checkout.session.completed
stripe trigger customer.subscription.created
stripe trigger customer.subscription.updated
stripe trigger customer.subscription.deleted
stripe trigger invoice.paid
stripe trigger invoice.payment_failed
stripe trigger customer.subscription.trial_will_end
```

### 5.3 Preview

**No webhook endpoint is registered for previews.** Preview deploys cannot exercise the billing webhook end-to-end. See §8 for the rationale.

---

## 6. Stripe Connect webhook

This receives events about *connected users'* invoices (when their clients' invoices go overdue, get paid, etc.).

### 6.1 Live mode (Production)

**Prerequisite**: [vercel.md](./vercel.md) is done and the production deploy is live.

Stripe dashboard → **Developers → Webhooks → Add endpoint** (in **live mode**):

| Field | Value |
|---|---|
| **Endpoint URL** | `https://paidsoon.com/api/webhooks/stripe-connect` |
| **Listen to** | **Events on Connected accounts** ← critical toggle |
| **Events** | `invoice.overdue`, `invoice.paid` (only — see below) |

Copy the **Signing secret** (`whsec_…`) → capture as `STRIPE_CONNECT_WEBHOOK_SECRET` per the matrix.

> **The "Connected accounts" toggle is non-obvious and easy to miss.** Without it, the endpoint only receives events from your own Stripe account, not from your users' accounts. The OAuth flow will look successful, but invoices will never be tracked.

The event list is exhaustive against the code — only these two events are handled:

| Event | Handled in code | Effect |
|---|---|---|
| `invoice.overdue` | [stripe-connect route L27](../../app/api/webhooks/stripe-connect/route.ts#L27) | Creates a `tracked_invoice` row, schedules the first follow-up email |
| `invoice.paid` | [stripe-connect route L31](../../app/api/webhooks/stripe-connect/route.ts#L31) | Marks the tracked invoice `paid`, stops the sequence |

The event-type union is defined in [lib/providers/types.ts L13](../../lib/providers/types.ts#L13). Do not subscribe to other invoice events — they will fall through and cause no harm, but they're noise.

### 6.2 Local — Stripe CLI

Forward connect events to local:

```bash
stripe listen --forward-connect-to localhost:3000/api/webhooks/stripe-connect
```

Same `whsec_…` capture rules as §5.2 — paste into `.env.local` as `STRIPE_CONNECT_WEBHOOK_SECRET`.

To simulate an overdue invoice from a connected account:

```bash
stripe trigger invoice.overdue --stripe-account acct_… 
```

(You'll need to actually have a Connect test account linked via the OAuth flow first.)

### 6.3 Preview

**No webhook endpoint is registered for previews.** See §8.

---

## 7. Cron — out of scope here

The cron that scans for overdue invoices runs in the application, not in Stripe. See [vercel.md §4](./vercel.md) for the cron schedule and the manual trigger.

---

## 8. Why previews don't have Stripe webhooks

Stripe webhook endpoints are registered against specific URLs. Vercel preview URLs change per-PR (`paidsoon-pr-42-…vercel.app`), so we cannot register a static URL up front. The two ways to fix this are:

| Option | What it requires | Trade-off |
|---|---|---|
| **(chosen) UI-only previews** | Nothing — Stripe webhooks just don't fire on previews | Previews can't end-to-end test webhook receipt; everything else (UI, OAuth, cron via manual trigger, dashboard) works |
| Stable preview alias | Set up `paidsoon-preview.vercel.app` in Vercel → Domains for the Preview env; register a second pair of test-mode webhook endpoints there | Doubles webhook configuration; introduces "is this hitting prod or preview?" failure mode |

We picked UI-only previews. To exercise webhook flows, run them locally with the Stripe CLI (§5.2 and §6.2).

---

## 9. Wipe and re-run

If you need to reset Stripe configuration:

- **API keys** are non-rotatable on a free dashboard; if leaked, rotate via dashboard → Developers → API keys.
- **Webhook endpoint** can be deleted and recreated; you must redo §5 / §6 and capture new `whsec_…` secrets.
- **Connect Client ID** never changes for the lifetime of the platform.
- **Products / prices**: if you change a tier price, create a **new** `price_…` and update the matching env var (`STRIPE_STARTER_PRICE_ID`, `STRIPE_SOLO_PRICE_ID`, `STRIPE_SMALL_BUSINESS_PRICE_ID`, or `STRIPE_BUSINESS_PRO_PRICE_ID`). Do not archive the old price until no existing subscriptions reference it. Remember `tax_behavior` is immutable — a new Price is required (not an edit) if it needs to change.

## 10. Trial and idempotency rules — pinned integration

Documentation/SDK cross-check: **2026-10-16**, public documentation and local
source only; no authenticated Stripe request, test-clock run or provider mutation.
[createStripeClient](../../lib/billing/stripeClient.ts) explicitly uses
`2026-05-27.dahlia`. The manifest allows `stripe ^22.1.1`; the installed package
inspected for this review is **22.2.0**, not an API-version change.

| Evidence | Operational rule |
| --- | --- |
| [Pinned subscription update](https://docs.stripe.com/api/subscriptions/update?api-version=2026-05-27.dahlia) | `trial_end` is Unix seconds, updates `billing_cycle_anchor` to that value and is at most **two years from `billing_cycle_anchor`**. It cannot accompany `trial_from_plan=true`. Do not substitute a now-relative application limit for this anchor-based provider restriction. |
| [Legacy free trials](https://docs.stripe.com/billing/subscriptions/trials/free-trials) | General trial guidance is at most **730 days**. Separately, PaidSoon application grants have a **730 elapsed-day horizon from confirmation** and exclusive UTC expiry. Application access never postpones Stripe charges. |
| Approved D5 extension contract — runtime present, not rolled out | Only a suitable still-`trialing` subscription, frozen absolute `trial_end`, `proration_behavior: "none"` and stable request-option `idempotencyKey`. No item/price, explicit anchor reset, collection, cancellation or schedule change; persist only verified returned/current dates. Owner service also conservatively caps at anchor +730 elapsed days and trial start +730 days. The legacy URL now confirms preview-backed Stripe intent only; old `{days}` requests are rejected. |
| [Current Trial Offers documentation](https://docs.stripe.com/billing/subscriptions/trials) | Requires `2026-09-30.endive` or later and cannot modify trial length. **No new Trial Offer integration**, API upgrade or billing-mode conversion is part of this change. |
| [Paused legacy trials](https://docs.stripe.com/billing/subscriptions/trials/free-trials#configure-pausing-when-a-payment-method-isnt-provided) | Stripe requires resumption before another trial on a paused subscription. This feature **never resumes** it, reverses cancellation or falls back silently to a grant when Stripe extension is unsafe. A debt-free paused tenant may receive explicit application-only access. |
| [Pinned API-v1 idempotency](https://docs.stripe.com/api/idempotent_requests?api-version=2026-05-27.dahlia) | POST keys cache the first executed response, **including 500**. Parameters must match. Keys may be pruned once at least 24 hours old; reuse after pruning can execute again. Validation/concurrent-execution rejections before endpoint execution are not cached, but a later rejection cannot prove an earlier unknown request had no effect. |
| [SDK portal sessions at v22.2.0](https://github.com/stripe/stripe-node/blob/v22.2.0/src/resources/BillingPortal/Sessions.ts) | `billingPortal.sessions.create` only: no retrieve/list or session metadata. Do not invent those recovery APIs. |
| [SDK schedules at v22.2.0](https://github.com/stripe/stripe-node/blob/v22.2.0/src/resources/SubscriptionSchedules.ts) | `from_subscription` creation cannot combine phase/config changes: create then update. `release` is a keyed Stripe POST leaving the subscription intact, even though PaidSoon's undo route uses DELETE. Never substitute schedule cancel. |
| [Pinned event names](https://docs.stripe.com/api/events/types?api-version=2026-05-27.dahlia) | Use §5's exact handled subscriptions, not wildcard names or Trial Offer event assumptions. |

### 10.1 Billing risk resolution is not debt forgiveness

[Trial preflight](../../lib/billing/trialEligibility.ts) and
[risk reconciliation](../../lib/billing/riskReconciliation.ts) verify the linked
customer, subscriptions, paginated subscription invoices and charge/dispute
mapping. Unreadable, ambiguous, unknown-price or conflicting identity evidence
blocks eligibility; cancellation does not erase historical obligations.

Failed/overdue outstanding invoices and `uncollectible` debt block grants.
Only verified payment or void of that same invoice resolves its retained debt
fact. Dispute states `warning_needs_response`, `warning_under_review`,
`needs_response`, `under_review` and `lost` block; verified `won`, `warning_closed`
or `prevented` can resolve that specific dispute. All blocking facts must clear,
and the grant must still be valid/unrevoked before it can supply access again.
An unrelated paid invoice, subscription deletion or timestamp never clears risk.

Direct the customer to `/dashboard/settings/subscription` and the existing
billing portal (`POST /api/billing/portal`) for supported billing/payment fixes,
or existing support/contact for disputed/lost debt requiring investigation.
This is not an in-app dispute adjudication, waiver or debt-forgiveness workflow.
Paid access and existing past-due grace policy remain separate; grants cannot
enhance delinquent access. Never advise manual local trial-date edits or grant
creation to bypass billing risk. Debtor disputes in invoice chasing are unrelated.

## 11. Durable customer billing recovery — in progress, not deployed

The current working tree journals all five customer mutation methods in
[the shared route boundary](../../lib/billing/customerBillingMutationRoute.ts):
Checkout POST (new session/upgrade), portal POST, cancel POST (local onboarding or
cancellation portal), and downgrade POST/DELETE. Successful bodies remain
`{url}`, local cancel `{redirectUrl}`, downgrade `{scheduledAt}` and undo
`{cancelled:true}`. All require authenticated identity, exact same Origin, UUID
`Idempotency-Key` and canonical nonnegative safe-integer
`X-Billing-Access-Version`. Missing/malformed headers return 400 before Stripe.
No query or arbitrary provider parameters are accepted. RLS verifies ownership;
only narrowly scoped server services access journals or write verified billing.

### 11.1 Durable evidence and replay deadline

- Persist the root `TenantBillingMutation`, immutable normalized intent/hash,
   starting binding/version/fingerprint, frozen configuration and initial step
   **before** provider mutation. A missing customer uses a deterministic
   `customer_create` child; binding, child completion and reservation handoff to
   the root are atomic, including the root's `executionVersion`.
- Each `TenantBillingMutationStep` stores write-once request/hash, method/target,
   `billing/<operationId>/<stepKey>` key, provider object/request references,
   sanitized evidence, attempts and timestamps. Freeze email/metadata, price
   mapping, trial setting, quantity and canonical URLs, never regenerate on retry.
- Commit each step's `firstAttemptAt` before dispatch. Exact keyed replay is
   permitted only when **now < firstAttemptAt + 24 hours** for that step. Equality
   is expired. A never-attempted later step has its own clock; recovery never
   resets an earlier clock. SDK mutation requests use `maxNetworkRetries: 0`.
- Under `billing-access:<userId>`, check tenant then operation/event fence,
   binding, reservation, lease and monotonic token before dispatch/commit. Never
   hold a DB transaction over a Stripe mutation. Reservation acquisition/release
   increments `billingAccessVersion`; either unresolved customer or owner
   reservation blocks new mutations. Lease expiry alone cannot release it.
- Retrieve known customer/Checkout/subscription/schedule IDs first. Create
   discovery must finish bounded pagination (100 pages of 100) and find one
   attributable tenant/operation match. Empty lists, matching prices or merely
   one schedule for a subscription do not prove nonexecution. A bare
   `from_subscription` create cannot carry correlation metadata.
- At or beyond the deadline, use retrieval/attributable evidence only. Unknown
   customer, Checkout, schedule or portal creates remain reserved for
   operator/provider investigation: **no new key, blind recreation or fallback
   grant**. Portal recovery requires durable verified response proof or exact
   in-window replay; there is no portal retrieve/list endpoint.
- Timeout, connection loss, cached 500, interrupted dispatch and provider success
   followed by failed proof/final DB commit stay pending/reconciliation-required.
   Schedule-create evidence must commit before freezing its phase update. A
   rejected later phase (or root after successful customer creation) is partial,
   remains reserved, and cannot trigger automatic release/cancel/compensation.
   Proven newer state may supersede a *known* result, never an unknown create.

### 11.2 Status and explicit reconciliation diagnostics

See the exact [DDD recovery contract](../DDD.md#own-customer-operation-recovery--task-312-in-progress-not-rolled-out)
and [operation route](../../lib/billing/customerBillingOperationRoute.ts).

| Endpoint | Scope and effect |
| --- | --- |
| `GET /api/billing/operations/[operationId]` | `getUser()` plus own profile RLS; own tenant **and actor**, root customer journal only. 200 safe status, no provider call, lease or recovery. |
| `POST /api/billing/operations/[operationId]/reconcile` | Same ownership, exact same Origin, reject cross-site fetch metadata, strict JSON `{}`. One explicit bounded attempt on stored intent/own prerequisite; no replacement key, parameters or IDs. Terminal replay is a read. |

Safe status fields: `operationId`, `action`, `status`, allowlisted `result`,
`failureCode`, `reconciliationRequired`, `canReconcile`, `createdAt`,
`completedAt`, relative `statusUrl`. No tenant/actor/child IDs, email, raw payloads,
provider IDs/keys/evidence, lease/fence or fingerprints. Responses are
`Cache-Control: private, no-store`.

| HTTP / code | Meaning and operator response |
| --- | --- |
| 202 safe operation status | Durably accepted but unresolved, including partial/commit failure. Preserve UUID/reservation; do not claim billing/access changed. |
| 400 `Invalid recovery body` | Reconcile requires exactly `{}`; mutation headers separately use `Invalid billing safety headers`. |
| 401 `Unauthorized`; 403 `Forbidden` | Authentication or same-origin failure, before journal/provider work. |
| 404 `Not found` | Same response for malformed/missing/foreign/owner/internal-child operation IDs or absent own profile. Not an admin-journal API. |
| 409 `billing_execution_in_progress` | Reconcile has a live/racing lease. Mutation version/reservation/intent conflicts instead use uniform `billing_conflict`. Refresh/observe, never auto-retry POST. |
| 502 `billing_provider_rejected` | Durable definitive rejection only, with no successful earlier partial effect. No redispatch of terminal intent. |
| 503 `billing_operation_unavailable` | Persistence/verification/status unavailable; do not fabricate 202 when accepted state cannot be read. Retain original client identity after lost responses. |

`reconciliationRequired` covers both unresolved statuses. `canReconcile` is
advisory, not a guarantee of success or permission for late POST replay. It is
false for terminal/live-lease/reservation-or-binding mismatch/partial rejection
and unknown expired portal creation; it can remain true beyond 24 hours for
retrievable/discoverable evidence. A still-unknown explicit attempt returns 202.
Billing/recovery stays reachable without subscription access. UI retains the
same UUID after loss, uses at most six GET observations two seconds apart, and
offers explicit reconciliation/manual GET. No automatic POST/DELETE retry loop.
For escalation use restricted journal evidence and provider request tracing;
never paste raw requests, customer email, keys or secrets into logs/tickets.

### 11.3 Hosted creation is not subscription completion

Verified Checkout/general portal/cancellation portal **creation** stores the
original safe result, completes its operation and releases the short reservation
even while Checkout is open. No reservation covers a hosted session's lifetime.
Actual cancellation remains portal-backed; there is no new direct cancel/resume.

[Hosted lifecycle verification](../../lib/billing/hostedCheckoutLifecycle.ts)
is shared by authenticated Checkout-success GET and signed completion webhook.
Retrieve session/customer/current expanded subscription; prove completed
subscription mode, matching tenant/customer/correlation and paid or legitimate
trial `no_payment_required` completion. Never synthesize active status from a URL,
requested tier, event name or creation proof. Legacy sessions with no operation
metadata require the existing verified customer/tenant mapping and uniqueness;
never backfill invented historical operations/fences. Verify any different bound
subscription and all live candidates before rejecting/rebinding delayed sessions;
ambiguous competing sessions/multiple live subscriptions require reconciliation.

Delayed genuine paid/trial state can reconcile while either reservation is held,
incrementing the version and invalidating previews. It preserves grants, risk,
both reservations and immutable creation results. Another operation's completed
fence, matching status, event timestamp or expired lease cannot clear an owner or
newer customer reservation or write an owner's frozen trial target. Only that
reserved operation's own attributable proof/current fence can finalize it.

### 11.4 Release and rollback boundary

Follow [Supabase artifact/validation status](./supabase.md#11-trial-access-and-customer-journal-database-gate)
and the ordered [deployment checklist](./vercel.md#12-trial-access-and-customer-billing-journal-release-gate).
Offline schema/client/static checks are not isolated DB validation. Drain old
unjournaled processes and reconcile in-flight legacy requests before enabling
owner mutations; hosted legacy sessions remain supported only by verified
lifecycle mapping. Rollback disables new mutations, not recovery/current-state
reconciliation, reservations, journals or still-valid grants. Never restore old
writers or customer billing privileges, drop evidence or blindly recreate Stripe
objects. No provider/dashboard changes were executed for this documentation work.

## 12. Owner trial recovery — in progress, not rolled out

Owner preview/confirmation/saga/recovery/audit runtime is present, not enabled.
Pending migration/CHECK/RLS and isolated validation plus unfinished entitlement,
jobs and UI tasks 5/6/8 still block rollout. Follow the existing release gate, not
a new flag. [Admin §9](./admin.md#9--trial-access-operations--in-progress-not-rolled-out)
and [DDD](../DDD.md#owner-trial-route-contract--in-progress-not-rolled-out) give
all six routes, adapter, strict inputs and safe HTTP/result contracts.

The adapter `/api/admin/tenants/[id]/actions/extend-trial` requires original
actor/session, current owner authority, same-origin and exactly
`{operationId,expectedVersion}` from an immutable 15-minute Stripe preview.
Reason, duration/expiry and notify were already validated/frozen at preview.
No raw `{days}` or grant/revoke intent is accepted. Application grants never
write Stripe fields, create/restart/resume subscriptions or fabricate charges.

Durable acceptance commits `trial_attempt`, reservation, frozen target and
`trial-extension/<operationId>` key before the one provider update; no transaction
spans that mutation. A definitive rejection can fail/release with audit (502).
Timeout/cached 500/lost result/failed final commit returns 202 and retains evidence
and reservation. No automatic grant fallback or mutation retry loop is allowed.

Read operation status first; it does not call Stripe or recover. The same original
actor with current active owner elevation may POST reconcile `{}` in any session,
including fresh elevation after the original expires. This does not relax preview
confirmation or notification retry. Recovery keeps original journal session and
appends current-session `trial_recovery` with `originalSessionId`/
`recoveringSessionId`; it never rewrites prior audit. Replay only identical intent/
key, strictly before durable `firstAttemptAt + 24 hours` and after safe binding/
configuration checks. At/after the deadline use attributable stored/provider
evidence, not blind POST. Matching current trial date, event timestamp, unrelated
Checkout completion or lease expiry does not prove the original request. Without
proof retain 202/unknown for provider investigation; never clear reservations,
use a new key or manually edit local Stripe trial dates to escape uncertainty.
Verified current lifecycle may reconcile while reserved, but only operation proof
and current owner fence can finalize; newer paid state must not be overwritten.
Notification failures are separate from Stripe/access results; follow
[Resend §7](./resend.md#7-trial-access-notifications--in-progress-not-rolled-out).
