# General settings

Open **Settings** from the signed-in dashboard. The **General** group contains Account, Connections, Team, and Subscription. This guide covers the requested Account, Connections, and Subscription settings. Team seats and invitations are not yet available; the Team screen may show seat counts, but do not rely on it to invite additional users.

## Account

Open `/dashboard/settings/account` to review your profile and account status.

- **Display name:** Enter your name or business name and select **Save**. This name can appear in automated invoice reminder emails. A blank name cannot be saved.
- **Email:** The account email is displayed but is read-only on this page. It cannot be changed from Account settings.
- **Account details:** Review the plan, subscription status, and member-since date. To manage the subscription, open **Subscription**.

If the saved display name does not appear in a reminder, confirm that you saved the profile and review the sender/template options in [InvoiceGuard](invoiceguard.md).

## Connections

Open `/dashboard/settings/connections` to connect payment or accounting data used by PaidSoon.

### Connect a source

1. Select **Connect Stripe**, **Connect Xero**, or **Connect MYOB Business**.
2. Complete the provider’s authorization flow and return to PaidSoon.
3. Review the connection status. Accounting integrations import overdue invoices; Stripe lets PaidSoon detect overdue Stripe invoices.
4. For Xero or MYOB Business, check the recent sync history after the first import. Select **Sync now** to run another sync or **Retry sync** after a failed run when that action is available.

The number of connected invoice sources is limited by plan. Stripe and accounting connections count toward that limit. If a connection is revoked, reconnect it to resume syncing. Disconnecting a provider pauses active reminder sequences for invoices from that account. MYOB may request additional authorization if you also use SpendLeak.

Only the providers currently listed in Connections are documented here. QuickBooks Online is not currently an available connection. Never share your accounting-provider password or authorization credentials with anyone.

## Subscription

Open `/dashboard/settings/subscription` to review your current plan and subscription status. The customer-selectable plans are **Essentials**, **Business Control**, **Small Business**, and **Business Pro**. Accountant Partner is contact-only, not a self-serve plan option.

### Application access versus billing — rollout in progress

The customer banner/subscription display, effective API/limit gates, onboarding intent flow, and scheduled-job checks are present in the working change as of 17 October 2026. They are not a deployed guarantee: isolated database/security verification, separately reviewed application, owner management UI, and release/browser acceptance remain gates. See the [release checklist](../runbooks/vercel.md#12-trial-access-and-customer-billing-journal-release-gate).

Read **Application access** separately from **Stripe billing plan** (or **Billing plan selection (not purchased)** without a linked subscription). The dashboard trial/grant banner shows the same access headline/description and any independent continuity, with **Review billing →**. A grant never replaces raw billing tier/status, recorded Stripe dates, prices, cancellation, or downgrade controls.

| Access display | Meaning |
| --- | --- |
| **Temporary PaidSoon grant** | Named-plan application access until an exact expiry. Copy says **PaidSoon access only until … — Stripe billing unchanged**. No purchase, postponed charge, or resumption of a canceled/paused subscription. |
| **Stripe trial** | Current Stripe-plan access. First-payment timing follows Stripe; only a confirmed suitable Stripe-trial extension changes that timing. If the recorded end is missing/stale while Stripe still reports trialing, timing is labeled **pending reconciliation**, not locally terminated. |
| **Onboarding trial** | Existing bounded signup access, not a Stripe charge date. Onboarding plan choice is purchase intent only; completion neither changes access nor starts a fresh trial or automatic Checkout request. |
| **Paid Stripe subscription** / **Payment grace** | The billing plan takes precedence over retained grants. Grace keeps its billing warning; grants cannot enhance it. No grant-based cutoff applies to paid/grace access. |
| **Application access unavailable** | No source currently authorizes application access. Billing settings/cancellation and signed-in recovery remain reachable. A retained grant record alone is not authorization. |

The headline's preferred plan and its source's end date can differ from the later **Independent … continuity** line. Later continuity names its own plan/date, not an extension of the preferred plan or Stripe billing. Application/recorded Stripe-trial instants show date, time including seconds, and **UTC**; renewal/cancellation/downgrade dates are date-only.

Unpaid/incomplete billing and known unresolved subscription debt or unresolved/lost subscription-charge disputes suppress grants; cancellation does not clear that risk. Past-due grace is not increased by a grant. Unknown billing/risk states do not authorize grants. Debtor-invoice disputes are separate. Revocation removes only the grant, preserving independently valid paid, Stripe-trial, or onboarding access.

Grant expiry is exclusive (`startsAt <= now < expiresAt`) and computed on new authorization/job execution, not by cleanup. Extension/plan changes preserve the current grant's chase-window start and consumption. A new post-lapse/revocation grant starts a new window without charging already-chased invoices again. Monthly AI cadence and usage logs are unchanged. Capacity alone does not stop underway reminders; lack of access does, while preserving sequence state for normal continuation after restoration.

### Billing actions and recovery

- To change plans, select a public plan, review the displayed feature and limit changes, then confirm. Existing upgrade/proration behavior remains Stripe-authoritative; a granted plan is not the purchased-plan basis. A downgrade is scheduled for the next renewal; the screen shows its effective date and lets you cancel the scheduled downgrade before it takes effect.
- Select **Manage billing** to open Stripe’s billing portal for billing management.
- If you cancel a subscription or trial, follow the confirmation flow and check the status and effective date shown on the page.
- If a request is pending or cannot be confirmed, do not assume payment, cancellation, or an access/date change. The current recovery UI retains the request identity, uses bounded read-only status checks, and offers **Check billing request status** and, when safe, **Reconcile this billing request**. Reconciliation is one explicit attempt, never an automatic mutation retry loop. Use `/billing/checkout` without dashboard access; contact support if unresolved instead of creating a replacement request.

Plan features and usage limits differ. Review the current plan comparison before changing plans, especially if the change would remove a feature or reduce an invoice-source limit. Do not assume that a plan name alone guarantees access to every advanced workflow; check the relevant module guide as well.

### Copy and date verification scope

Compared with the actual [subscription component](../../components/settings/SubscriptionClient.tsx), [banner](../../components/dashboard/TrialBanner.tsx), [presentation/date functions](../../lib/subscriptionStatusPresentation.ts), and [presentation tests](../../tests/subscription-status-presentation.test.ts). The overlap fixture names Business Control Stripe access through 18 October 2026 and Small Business continuity through 23 October 2026. The actual formatter outputs **23 October 2026 at 12:00:00 pm UTC** for that grant's expiry. These are test examples, not customer dates.

On 17 October 2026, 502 focused mocked Node tests passed (0 failed/skipped) across 15 files covering presentation/page/layout, billing recovery, effective access, quotas/sender/AI limits, onboarding, reminders, summaries, and financial jobs. This was not a full-suite, build, Python-worker, live-provider, or database verification run. Job evidence/limits are described in the [orchestration runbook](../runbooks/railway.md#verification-scope-for-this-documentation-update).

No UI screenshots were found in the repository image inventory; existing images are logos/icons. No screenshot or browser visual review is claimed. Acceptance here compares actual source copy/date projection, not a fabricated screenshot; deployment and owner/staff/tenant browser checks remain separate release work.

## Related guides

- [Getting started](getting-started.md)
- [InvoiceGuard](invoiceguard.md)
