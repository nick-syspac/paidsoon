# InvoiceGuard

InvoiceGuard is the invoice follow-up area in Settings. Configure a schedule, confirm who reminder emails come from, and review the three reminder-stage templates before using automated follow-ups. The controls available depend on your plan.

## Schedule

Open **Settings → InvoiceGuard → Schedule** at `/dashboard/settings/schedule`.

The sequence has three stages, each set as a number of days after the invoice due date. The default sequence is 3, 10, and 21 days after the due date.

- On **Essentials**, the sequence is fixed; the fields are shown but cannot be changed.
- On **Business Control**, **Small Business**, and **Business Pro**, enter the day for each stage and select **Save schedule**. Use a positive number of days for each stage. Wait for the saved confirmation; if an error appears, correct the values and retry.

Changing a schedule affects follow-up timing. Review the configured intervals before relying on it for active invoices.

## Email

Open **Settings → InvoiceGuard → Email** at `/dashboard/settings/email`.

- **Essentials:** reminder emails use the PaidSoon system From address, and replies go to your account email.
- **Business Control and above:** you can set an optional Reply-to address and a custom From name.
- **Small Business and Business Pro:** you can use a custom From email address after verifying the sending domain. Enter the address, save, and complete the verification step. PaidSoon uses the system From address until the custom address is verified.

Select **Save email settings** after making changes. Use an address you control for replies. If the custom From option is unavailable, or verification is pending, check the plan requirements and the status shown on the page. Your account email itself is managed separately in [General settings](general-settings.md).

## Templates

Open **Settings → InvoiceGuard → Templates** at `/dashboard/settings/templates`.

The editor is organized by reminder stage:

1. **Stage 1 — Gentle Reminder:** friendly first follow-up.
2. **Stage 2 — Firm Follow-up:** a clearer request after the earlier reminder.
3. **Stage 3 — Final Notice:** a more direct final reminder.

Select a stage to view its template. You can inspect the visual, HTML, or plain-text version. On **Business Control and above**, edit the subject and body, insert supported variables from the editor, then select **Save**. Select the reset action for that stage to restore its default template. Essentials can use the default templates but cannot edit them.

The editor’s variables include customer name, invoice reference, amount due, due date, payment link, and your display name. Days overdue and firm deadline are available for Stage 3. An AI Rewrite action, where included in your plan, offers a suggestion for the selected stage; review it and choose whether to apply it, then save. It does not silently replace a template.

The current editor provides one template for each of the three stages. Per-customer sequences and separate customer-specific wording are not currently available, even if a plan comparison lists related future features.

## Plan summary

| Plan | Schedule and email options | Template options |
| --- | --- | --- |
| Essentials | Fixed 3/10/21-day schedule; system sender | Default templates |
| Business Control | Custom schedule; custom sender name and Reply-to | Editable stage templates; AI Rewrite |
| Small Business | Business Control options plus verified custom From address | Editable stage templates; AI Rewrite |
| Business Pro | Small Business options | Editable stage templates; AI Rewrite |

Features are subject to current plan entitlements and any verification requirement. Check the Settings page if your account shows different options.

## Import / Export

Open **Settings → InvoiceGuard → Import / Export** at `/dashboard/settings/import-export`. This screen contains separate invoice import, expense import, invoice export, MarginGuard export, and CommitGuard settings-transfer tools. These do not make a full PaidSoon account backup.

### Import overdue invoices

1. Download the invoice CSV template and replace its fictional sample rows with your data.
2. Upload a CSV file of up to 5 MB. Invoice import does not accept XLSX.
3. Review the suggested column mapping and choose how matching invoices should be handled: skip existing records, or update eligible invoices. The update option does not change reminder status for paid or resolved records.
4. Continue to validation. Review the row preview and warnings; fix blocking errors in your source file and retry if required.
5. Select **Import invoices** to commit the validated rows. Importing does not send reminder emails: imported invoices start paused. Review them on the Invoices dashboard and explicitly resume follow-ups when you are ready.

The import history shows previous batches and any available error report. Keep the original source file until you have checked the imported invoices.

### Import expenses for SpendLeak

The separate **Expense import** section on the same page accepts CSV or XLSX files up to 5 MB. Use its expense template, map columns, select a duplicate-handling option, review validation results, then commit the import. This sends expense records to SpendLeak analysis; it does not import invoices into InvoiceGuard. See [SpendLeak](spendleak.md) for the review workflow.

### Export invoices

Invoice exports require **Small Business** or **Business Pro**. Choose CSV or XLSX, then optionally filter by invoice status, customer, accounting source, or date range. A date-range filter can use due date or created date; invoice date may be included in the export but is not a filter. Leaving statuses unselected includes all statuses. Select **Generate export** to download the matching rows. If no rows match, adjust the filters and try again.

Invoice export files can contain customer and financial details. Store and share them carefully.

### Other exports and settings transfer

- **MarginGuard exports** are a separate CSV/XLSX tool for summary metrics, customer profitability, alerts, or the opportunity pipeline. Summary and customer datasets can be limited by period. On self-serve plans, export is available on Small Business and Business Pro. It is not the invoice export with different formatting. See [MarginGuard](marginguard.md).
- **CommitGuard settings import / export** transfers CommitGuard configuration as JSON. Export the settings, keep a copy of the JSON, or paste previously exported settings to restore that configuration. This does not export or restore commitment records or other account data. See [CommitGuard](commitguard.md).

None of these tools is a complete account backup or restore. In particular, invoice/expense exports and CommitGuard’s settings JSON cover different data; they do not include all PaidSoon records, connections, or account state.

## Related settings

- [General settings](general-settings.md) — profile, connections, and subscription.
- Import / Export is covered below; those transfers are separate from connecting a live invoice source.
