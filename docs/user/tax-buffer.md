# Tax Buffer

Tax Buffer estimates tax reserves, reserve gaps, upcoming obligations, and safe-to-spend cash using the financial information available to PaidSoon. It is a planning estimate—not tax, accounting, or financial advice. Confirm obligations and calculations with your accountant or the relevant tax authority before acting.

**Access:** Tax Buffer core is included from **Essentials** upward. Automated reserve features require **Business Control** or higher. Custom reserve categories require **Small Business** or **Business Pro**.

## Set up Tax Buffer

Open **Settings → Tax Buffer** at `/dashboard/settings/tax-buffer`.

1. If **Suggested first-time setup available** appears, review the reasons and select **Apply suggested defaults** only if they fit your business. Suggestions prefill settings; they do not verify your tax position.
2. Enable Tax Buffer, choose **Accounting basis** (Cash or Accrual), enter your **Business type**, and select **GST frequency** (Monthly, Quarterly, or Annually).
3. Enter the **Tax reserve balance** currently quarantined for tax. Keep this manual value current; the settings page does not offer a linked-account selector in its current form.
4. Under **Reserve categories**, enable or disable the categories relevant to you. Choose each category’s method (Integration, Fixed amount, % of profit, % of revenue, or Manual) and recurrence. Enter a rate, fixed amount, or manual fallback when the selected method exposes that field.
5. Select **Save settings**, then open `/dashboard/tax-buffer` and check for data-quality warnings and setup mode.

Essentials and Business Control can use the standard categories. Custom categories are locked unless your plan includes the custom-reserves feature.

## Read the dashboard

The Tax Buffer dashboard shows available cash, recommended reserve, current reserve, safe-to-spend, reserve gap, health status, and a suggested weekly target/transfer amount. The category breakdown identifies the required and reserved amount, shortfall, source, and confidence. The upcoming obligations table covers the next 90 days and shows due date, estimated amount, reserved amount, and status.

Review the setup banner, warnings, source and confidence labels before relying on an estimate. Missing or stale financial inputs, a disabled category, or an outdated manual reserve balance can make the result incomplete. A suggested transfer is an estimate for your review, not an instruction to move money.

## Related guides

- [Connections and subscription](general-settings.md) — connect data sources and review plan access.
- [Import / Export](invoiceguard.md) — review supported imports for financial data.
- [CashPlan](cashplan.md) — review the current cash-plan status and settings.
- [RunwayGuard](runwayguard.md) — review its separate sample-like forecast limitations.
