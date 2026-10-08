# Owner’s Digest

Owner’s Digest combines prioritized signals and key numbers from modules that are enabled and have usable data. **Business Control**, **Small Business**, and **Business Pro** include the Digest dashboard; scheduled email delivery requires **Small Business** or **Business Pro**. Essentials does not include the Digest core feature.

## Configure the Digest

Open **Settings → Owner’s Digest** at `/dashboard/settings/owners-digest` and select **Save settings** after changing options.

- **Digest status** controls whether the Digest is enabled. **Email delivery** is a separate on/off choice.
- **Frequency** can be Off, Daily, Weekly, or Monthly. For any scheduled frequency, choose a delivery time; for Weekly, also choose a delivery day.
- **Maximum action items** controls how many action items are included (1–10). **Minimum materiality (A$)** filters lower-impact items.
- Choose whether to include **Needs attention**, **Opportunities**, **Positive changes**, and **Key numbers**. **Send digest when no issues are found** controls whether an empty Digest is emailed.
- **Recipient scope** defaults to Business owner only. Although the form also offers All authorized users, team invitations and multi-user seats are not currently available; do not assume this setting adds working team recipients.

Scheduled delivery currently checks the selected hour and day in **UTC**, not your local time. The settings page has no timezone selector; a stored timezone value does not change the current scheduler behavior. Monthly email is due on the first UTC calendar day of the month; the selected delivery day is used for weekly delivery. For example, a time of 07:00 is checked as 07:00 UTC, not 07:00 in your local timezone.

To receive email, both Digest and Email delivery must be enabled and your plan must include the email entitlement. Business Control includes Digest dashboard/history access but not scheduled Digest email. Check the delivery status and plan if an email is not sent.

## Read the dashboard and history

Open `/dashboard/owners-digest` to review the current period. The page shows the overall status, summary, generation time, data-current-as-of time, and source completeness. Review **Needs Your Attention**, **Opportunities**, **Positive Changes**, and **Key Numbers**; use a source’s **View details** link to investigate an item. The History list opens earlier Digest snapshots.

A partial, stale, unavailable, or not-configured source can limit the summary. Connect the relevant data source or configure the module, then review the source status and data-as-of time before acting on a number. No material finding does not mean every source is complete.

## Related guides

- [Getting started](getting-started.md) — configure your account and connections.
- [Subscription](general-settings.md) — review plan and billing access.
