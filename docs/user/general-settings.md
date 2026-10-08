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

- To change plans, select a public plan, review the displayed feature and limit changes, then confirm. An upgrade continues to Stripe Checkout and takes effect immediately after completion. A downgrade is scheduled for the next renewal; the screen shows its effective date and lets you cancel the scheduled downgrade before it takes effect.
- Select **Manage billing** to open Stripe’s billing portal for billing management.
- If you cancel a subscription or trial, follow the confirmation flow and check the status and effective date shown on the page.

Plan features and usage limits differ. Review the current plan comparison before changing plans, especially if the change would remove a feature or reduce an invoice-source limit. Do not assume that a plan name alone guarantees access to every advanced workflow; check the relevant module guide as well.

## Related guides

- [Getting started](getting-started.md)
- [InvoiceGuard](invoiceguard.md)
