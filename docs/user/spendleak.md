# SpendLeak

SpendLeak analyzes connected or imported spend for patterns such as recurring spend, duplicate spend, renewals, supplier concentration, and cash pressure. Among self-serve plans, SpendLeak access is currently limited to **Small Business**; Accountant Partner is contact-only rather than a self-serve plan choice.

## Set expected source coverage

Open **Settings → SpendLeak** at `/dashboard/settings/spendleak`. Under **Expected source coverage**, select the sources you expect to use:

- **Bills** — supplier bills and invoice-like charges.
- **Bank transactions** — outgoing transactions used for duplicate-payment and cash-pressure evidence.
- **Suppliers** — supplier details used for supplier concentration and context.

Keep at least one source selected and choose **Save settings**. This setting controls readiness and partial-data messaging only; it does not turn a provider sync or import on or off. Connect an available accounting source or import expenses separately, then check the latest sync and source coverage on the SpendLeak dashboard.

## Manage categories and optional suggestions

The **Imported spend classification** section lets you add, rename, merge, and retire analytical spending categories. These are PaidSoon classifications; changing them does not write back to Xero, MYOB, or other source records. The reserved **Other** category cannot be changed or retired.

The **External classification with Jev** setting is off by default. When enabled, unresolved transaction context may be sent to TypeSafe in the United States for Jev suggestions. The product’s consent notice describes the minimized fields sent, what is excluded, and the provider’s retention terms. Review that notice before opting in. Suggestions still require your confirmation. Turning the setting off stops future external classification requests; existing suggestions and classifications remain available.

## Import expenses

To add file-based spend, open **Settings → InvoiceGuard → Import / Export** at `/dashboard/settings/import-export` and use **Expense import**. It accepts CSV or XLSX files up to 5 MB. Download the expense template, map the source columns, select a duplicate-handling option, review validation results, and commit the import. The import history shows previous batches. For the separate invoice CSV workflow, see [InvoiceGuard](invoiceguard.md).

## Review SpendLeak findings

1. Open the SpendLeak dashboard at `/dashboard/spendleak` and review the readiness banner, selected-source coverage, and last-sync information.
2. Review the module summaries and findings. A finding appears when supported data meets an alert-grade rule; an empty findings list does not by itself mean the sources failed to sync.
3. Choose **Review imported spend** to open `/dashboard/spendleak/review`. Filter the imported records by status, then confirm or correct categories for individual records or explicitly selected groups.
4. For an individual correction, you may add a merchant or text-match rule for future source records. Bulk confirmation only confirms the selected records; it does not create a future rule.

Review decisions and categories stay in PaidSoon and do not alter the accounting provider’s source data. Review any automated suggestion before confirming it; a displayed confidence value is not a guarantee that the classification is correct.

## Related guides

- [Getting started](getting-started.md) — connect an invoice or accounting source.
- [InvoiceGuard](invoiceguard.md) — distinguish invoice import from expense import and review export options.
