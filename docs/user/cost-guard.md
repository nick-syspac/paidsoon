# Cost Guard

Cost Guard is a cost-monitoring dashboard for reviewing spend changes, supplier/category alerts, and forecast information. The current dashboard combines user-specific forecast and alert records with static or sample-like presentation values. In particular, **Costs monitored**, **Typical month**, the spending-trend bars, and the “progressing faster than the month” message are not calculated from your verified live account data. Treat them as illustrative UI, not financial results. Verify any decision against your accounting records.

## Open Cost Guard and check your data

- Dashboard: `/dashboard/cost-guard`
- Settings: `/dashboard/settings/cost-guard`
- The Cost Guard routes currently require sign-in but do not check a Cost Guard plan feature flag. Product availability is marked **Private beta**; the route being visible does not imply unrestricted product availability.

For the live portions of the dashboard, connect an accounting source or wait for relevant financial data to sync. Cost Guard reads its forecast and alert records and also shows recurring-spend findings from SpendLeak. If you see the first-review message, review your connections and data imports. If you see a stale-data warning, check that the source has synced recently. A zero or empty card is not proof that no costs exist.

The dashboard has **Overview**, **Alerts**, **Suppliers**, **Categories**, and **Rules** sections. Review alert severity and details, then use the supplier/category context and configured rules to investigate a change. Some alert details can link to related CommitGuard commitments. Cost Guard is for analysis and investigation; it does not edit upstream accounting records.

## Tune Cost Guard settings

On the settings page, adjust the available controls and select **Save settings**:

- **Alert sensitivity** sets the percentage change threshold used when judging whether a cost change is material.
- **Minimum materiality** sets the A$ floor; changes below it are masked to reduce noise.
- **Baseline lookback** sets the number of days used to compare supplier or category spend with its normal baseline.
- **Digest frequency** can be Daily, Weekly, or Monthly.

The page also describes current behavior: new-supplier detection is enabled by default; thresholds use both percentage and absolute-value triggers; and critical or warning alerts can appear in the main dashboard and notification centre. The visible frequency setting should not be treated as a guarantee that an email was sent; check the product’s current notification behavior and your source data.

## When figures look wrong

1. Check **Settings → Connections** and confirm the accounting connection is active and has synced.
2. Confirm the relevant transactions or bills are present using [SpendLeak](spendleak.md) and the [Import / Export guide](invoiceguard.md).
3. Check the forecast period and whether its data is stale; the dashboard itself identifies records older than its freshness window.
4. Do not rely on the static/sample-like cards and trend graphic described above as verified account values.

## Related guides

- [SpendLeak](spendleak.md) — review imported spend and recurring-cost findings.
- [CommitGuard](commitguard.md) — track commitments related to an alert.
- [Connections and subscription](general-settings.md) — connect or review data sources.
