# Dashboard guide

The PaidSoon dashboard is a set of workspaces for invoice follow-up and financial operations. Open a section from the dashboard navigation; on narrow screens, the navigation may scroll horizontally. Some sections are shown only when your account has the required access. Connected or imported data also affects what a section can show.

## Overview

Open **Overview** at `/dashboard`. It is a triage and summary page, not a complete accounting ledger. Start with **Attention** to review invoice signals such as overdue invoices, chase allowance, broken promises, held invoices, and other issues. Select a card to open the related invoice list or follow its link to investigate.

The page also brings together available cash posture and module summaries, including CashPlan, RunwayGuard, Tax Buffer, Owner's Digest, CommitGuard, Cost Guard, MarginGuard, and receivables/spend signals. Use each summary's module link for more detail. Depending on your access and data, some summaries may be absent, show an empty/setup state, or contain incomplete or illustrative values. Confirm financial details against the relevant source records.

## Invoices

Open **Invoices** at `/dashboard/invoices` to review records still in the follow-up workflow, including pending, paused, snoozed, or sequence-complete invoices. The list is ordered by next scheduled email where available. Overview cards can open the list with a filter applied. Open an invoice to inspect its follow-up details and history; actions such as pausing, resuming, snoozing, resolving, or handling a dispute depend on its current status. Do not assume every action is available for every row.

The page links to invoice import. An export control appears only when your plan includes invoice export. For supported import/export formats and steps, see [InvoiceGuard: Import / Export](invoiceguard.md#import--export).

**Invoices is not the same as InvoiceGuard settings.** The list is where you review and manage invoice follow-ups. InvoiceGuard settings control reminder schedules, sender options, and templates; see [InvoiceGuard](invoiceguard.md).

## Resolved Invoices

Open **Resolved Invoices** at `/dashboard/resolved` to review paid and manually resolved invoices. This is separate from the active follow-up list; resolved records are not presented as invoices awaiting another reminder. The table is ordered by most recently updated and lets you review each record's available details. An empty list means there are no paid or manually resolved records to show yet.

For information about marking an invoice resolved and the effect on its follow-up, see [InvoiceGuard](invoiceguard.md) and the in-app Help Centre's [Manually resolve an invoice](../../content/help/manually-resolve-an-invoice.mdx) article.

## Owner's Digest

Open **Owner's Digest** at `/dashboard/owners-digest` for a prioritized summary assembled from enabled modules and available data. Review its overall status, attention items, opportunities, positive changes, key numbers, and previous digest history where available. Use a source's detail link to investigate the underlying signal. The Overview page may show a compact Digest summary; open the full section for context. See [Owner's Digest](owners-digest.md) for setup, delivery, access, and data-completeness details.

## DepositGuard

Open **DepositGuard** at `/dashboard/deposit-guard` to monitor jobs, deposit requests, outstanding amounts, overdue requests, and work blocked pending a deposit. Search or filter the job list, then open a job for its request and payment status. Creating or managing requests and other workflows depends on the relevant entitlement; see [DepositGuard](depositguard.md) for setup and current plan limitations.

## CommitGuard

Open **CommitGuard** at `/dashboard/commitguard` to review tracked recurring and one-off commitments, upcoming due dates, renewal or notice windows, and cash commitment summaries. If recurring detection is available, review candidates before confirming or dismissing them. Keep commitment amounts and dates current, and verify obligations against the original provider or contract. See [CommitGuard](commitguard.md) for controls, plan limits, and workflow details.

## Cost Guard

Open **Cost Guard** at `/dashboard/cost-guard`. Its sections include an overview, alerts, suppliers, categories, and rules for investigating cost changes and configured signals. The Overview page may also show Cost Guard status or notifications. **Some Cost Guard presentation values are static or sample-like rather than verified live account figures.** Check the [Cost Guard guide](cost-guard.md) before relying on any displayed value, and confirm costs in your accounting records. The guide also explains its current availability status and data requirements.

## MarginGuard

Open **MarginGuard** at `/dashboard/margin-guard` to review gross margin and profit, target gaps, trends, customer profitability, and alerts where the required data and access are available. Incomplete revenue or expense classifications can make results partial. See [MarginGuard](marginguard.md) for source-data preparation, dashboard interpretation, settings, and exports.

## RunwayGuard

Open **RunwayGuard** at `/dashboard/runway-guard` to review the module's cash-runway and cash-exhaustion risk view. The Overview page may also show a compact RunwayGuard summary and a link to the module. The current standalone module's forecast output is illustrative and is not a confirmed live forecast of your account; see the [RunwayGuard guide](runwayguard.md) before interpreting its figures. For saved cash-plan status, review [CashPlan](cashplan.md).

## Tax Buffer

Open **Tax Buffer** at `/dashboard/tax-buffer` to review available cash, estimated reserves, reserve gaps, and upcoming obligations where access and data are available. The Overview page may show a compact reserve and safe-to-spend summary. **Tax Buffer figures are planning estimates, not tax, accounting, or financial advice.** Check assumptions and data-quality warnings and confirm obligations with your accountant or the relevant tax authority. See [Tax Buffer](tax-buffer.md) for setup and interpretation.

## SpendLeak

Open **SpendLeak** at `/dashboard/spendleak` to review spend analysis, source coverage, recurring or duplicate-spend findings, and related supplier or cash-pressure signals. Imported expenses may require classification review before findings are useful. The Overview page can show spend-side signals or an access/setup prompt. See [SpendLeak](spendleak.md) for sources, imports, classification review, access, and limitations.

## If a section is missing or looks incomplete

Dashboard sections and actions can depend on subscription access, source connections, imported records, and data freshness. Check the linked guide for the module's current requirements. A visible section or summary is not proof that every workflow is enabled or that every displayed figure is complete and current. For connecting a source or reviewing your subscription, see [General settings](general-settings.md).
