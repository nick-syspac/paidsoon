# MarginGuard

MarginGuard analyzes gross margin, gross profit, target gaps, customer profitability, trends, and margin alerts using financial records in PaidSoon. MarginGuard core access starts on **Business Control**; Essentials does not include it. The plan catalog marks customer analysis, alerts, scenarios, and historical analytics as Small Business/Business Pro entitlements. Not every entitlement corresponds to a separate screen or control in the current UI; this guide describes only the visible settings and dashboard workflows.

## Prepare reliable data

MarginGuard needs revenue and cost records to calculate meaningful results. Its settings page shows whether it has InvoiceGuard invoices, imported bills, bank transactions, and accounting connections, including connection status and last sync where available.

1. Connect your accounting source in **Settings → Connections**, or import supported financial data from **Settings → InvoiceGuard → Import / Export**.
2. Review the **Data Sources** table in MarginGuard settings. Resolve missing or inactive sources and sync/import the records needed for the period you want to analyze.
3. Configure expense classifications and review the assumptions/completeness shown on the dashboard. Incorrect or incomplete classifications can change gross profit and margin calculations.

MarginGuard currently recommends connecting accounting software, importing transactions, classifying expenses, and setting target margins before relying on profitability analysis.

## Set targets and alerts

Open **Settings → MarginGuard** at `/dashboard/settings/margin-guard`.

- **General:** enable or disable MarginGuard and choose a default period: 30 days, 3 months, 6 months, 12 months, or financial year.
- **Margin Targets:** enter target, warning, and critical gross-margin percentages. Critical must be below warning, and warning must be below target. Save the organization target, or configure a scoped override for a customer, product/service, category, or project/job using its scope key. Where there is no scoped target, the organization target is used.
- **Cost Classification And Alerts:** choose which warning, critical, deterioration, negative-margin, low-customer-margin, and data-quality alert conditions to enable. Choose a Daily, Weekly, or Monthly alert digest frequency.
- **Rule builder:** create supplier, category, account, text-match, or recurring rules; select a cost classification and priority; preview matches; save a rule; and apply it to matching records.
- **Recent classifications:** inspect the latest classifications, filter by class, and apply a manual direct-cost override. Manual overrides take precedence over rule-based classifications until changed.

Select **Save settings** for the General and alert settings. Target and rule actions have their own save/preview/apply controls.

## Read the dashboard

Open `/dashboard/margin-guard`. Use the period buttons (30 days, 3, 6, or 12 months, or financial year) and optionally enable previous-period comparison. Review:

- **Gross Margin**, **Gross Profit**, and **Margin At Risk** against the target and warning thresholds.
- **Margin Data** completeness and confidence, plus the missing-data assumptions that may reduce reliability.
- **Margin trend**, active alerts, customer profitability, and invoice margin basis.
- **Confirmed spending categories**, which are contextual data; the page notes that MarginGuard cost classes remain separate and drive its calculations.

If revenue is missing, the dashboard shows an empty-data prompt with links to connect accounting, import data, and configure MarginGuard. Low completeness or missing classifications means the dashboard should be treated as partial, not as a full profitability view. Validate important business decisions against your underlying records.

## Related guides

- [Connections and subscription](general-settings.md) — connect an accounting source and review plan access.
- [Import / Export](invoiceguard.md) — understand supported data imports and exports.
- [SpendLeak](spendleak.md) — review spend data and classifications used elsewhere in PaidSoon.
- [Cost Guard](cost-guard.md) — investigate unusual cost changes.
