# CommitGuard

CommitGuard tracks recurring and one-off commitments, upcoming due dates, renewals, and safety-buffer estimates. The core commitment workspace is available on **Essentials** and above. Recurring-commitment detection requires **Business Control** or higher; advanced alert entitlement is available on **Small Business** and **Business Pro**.

## Configure CommitGuard

Open **Settings → CommitGuard** at `/dashboard/settings/commitguard`. Change the controls you need and select **Save settings**.

- **Module status:** enable or disable CommitGuard calculations. Disabling it does not delete commitments.
- **Default horizon:** choose 7, 30, 60, or 90 days for the default forecast horizon.
- **Safety buffer:** choose a fixed amount, a percentage of monthly commitments, or weeks of operating expenses. The current form shows amount and percentage fields but no editable weeks field; do not assume a custom number of weeks can be entered here.
- **Advanced detection rules:** enable or disable recurring detection and adjust minimum occurrences, amount-variance tolerance, interval tolerance, confidence threshold, and renewal warning days. Detection results are suggestions to review, not commitments automatically confirmed on your behalf.
- **Alerts:** select the due-soon, renewal, notice-period, amount-change, low-buffer, and shortfall alerts that are relevant to you. Some advanced alert behavior requires a higher plan.

## Add and maintain commitments

Open the CommitGuard dashboard at `/dashboard/commitguard`.

1. Use **Add commitment** to enter a name, category, amount in A$, frequency, and next due date.
2. Open **Advanced fields** if you want to add a description, supplier, renewal date, notice period, notes, or the auto-renew flag.
3. Select **Add commitment**. Review it in the upcoming commitments and horizon summaries.
4. Use **Edit**, **Pause**, **Resume**, or **Cancel** in the lifecycle actions list to maintain the record as circumstances change.

The dashboard summarizes commitments over several horizons and shows upcoming renewal and notice windows. Filter and sort the commitment list to find items that need review. Tracked commitment limits are plan-dependent: Essentials 25, Business Control 150, Small Business 500, and Business Pro 2,000.

## Review detected candidates

If your plan includes recurring detection, review the **Detected commitments review** section on the dashboard. Check each candidate’s name, frequency, typical amount, source, and confidence. Choose **Confirm** only when it represents a real commitment; otherwise choose **Ignore** or **Not a commitment**. Confirming a candidate is a separate action from manually adding a commitment.

## Data and feature limits

CommitGuard’s totals and free-cash/safety-buffer indicators are estimates based on the commitments and available financial inputs in PaidSoon. Keep amounts, recurrence, next due dates, renewal dates, and notice periods current; verify important obligations against the original contract or provider record.

Team seats and invitations, approval mode, and weekly summary email are not currently implemented. Do not rely on those features for shared approvals or scheduled team reporting. CommitGuard’s JSON import/export under **Settings → InvoiceGuard → Import / Export** covers settings only, not the commitment records themselves; see [InvoiceGuard](invoiceguard.md).
