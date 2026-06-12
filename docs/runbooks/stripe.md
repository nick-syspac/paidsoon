# Stripe runbook

Stripe is used **twice** in PaidSoon, for two unrelated purposes:

1. **Stripe Billing** — your customers pay for one of the paid tiers (Starter, Solo, Small Business) on your own Stripe account.
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

- **Name**: `PaidSoon Starter`
- **Pricing**: Recurring, monthly, **$9.00 USD / month**

Save, then copy the **Price ID** (starts with `price_…`) and capture it as `STRIPE_STARTER_PRICE_ID` per the matrix.

Repeat for the other paid tiers:

- **Name**: `PaidSoon Solo`
- **Pricing**: Recurring, monthly, **$19.00 USD / month**
- Capture the Price ID as `STRIPE_SOLO_PRICE_ID`

- **Name**: `PaidSoon Small Business`
- **Pricing**: Recurring, monthly, **$39.00 USD / month**
- Capture the Price ID as `STRIPE_SMALL_BUSINESS_PRICE_ID`

These are read by [app/api/billing/checkout/route.ts](../../app/api/billing/checkout/route.ts) when a user switches plans. `STRIPE_PRO_PRICE_ID` is now only an optional legacy fallback for Solo; prefer `STRIPE_SOLO_PRICE_ID` in all environments.

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
| **Events** | `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed` |

Copy the **Signing secret** (`whsec_…`) → capture as `STRIPE_BILLING_WEBHOOK_SECRET` per the matrix.

> **Note on `invoice.payment_failed`**: This event is required in the dashboard subscription so the data is delivered when the handler ships, but **as of June 2026 it is not yet handled in code**. The webhook returns `{received: true}` for unknown event types ([stripe-billing route](../../app/api/webhooks/stripe-billing/route.ts)) so subscribing is non-breaking. Tracked in follow-up change `handle-billing-payment-failed-webhook`.

The three event branches that **are** handled by the route:

| Event | Effect |
|---|---|
| `checkout.session.completed` | Marks the user as the selected paid tier from Checkout metadata |
| `customer.subscription.updated` | Sync subscription status → tier |
| `customer.subscription.deleted` | Revert to Starter; pause invoices over the Starter-tier limit |

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

To trigger specific events for testing:

```bash
stripe trigger checkout.session.completed
stripe trigger customer.subscription.updated
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
- **Products / prices**: if you change a tier price, create a **new** `price_…` and update the matching env var (`STRIPE_STARTER_PRICE_ID`, `STRIPE_SOLO_PRICE_ID`, or `STRIPE_SMALL_BUSINESS_PRICE_ID`). Do not archive the old price until no existing subscriptions reference it. If you still carry `STRIPE_PRO_PRICE_ID`, treat it as a temporary Solo fallback only.
