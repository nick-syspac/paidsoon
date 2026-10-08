# CashPlan

CashPlan summarizes a forward cash view, including status, confidence, lowest projected cash, buffer health, freshness, and recommended actions. Its current customer-facing settings page is a **read-only review**: it displays the plan name and current currency, timezone, horizon, buffer target, and review role. It does not provide controls to change those settings.

The CashPlan review page requires sign-in. The current page has no plan-feature gate, but connected-module inputs and functionality can depend on the features available to your subscription.

## Review the current plan

Open **Settings → Cash Plan** at `/dashboard/settings/cash-plan`. Review:

- **Status** and its summary, including whether the forecast is healthy, preliminary, or stale.
- **Confidence** and **Lowest cash** as shown for the current forecast.
- **Current plan settings:** plan name, currency, timezone, forecast horizon in weeks, buffer target, and review role.
- **Recommended actions** for the current status.

The dashboard overview also includes a **Cash posture** card with status, confidence, lowest cash, freshness, and recommended actions. Its forecast-settings/review links open the same Cash Plan settings page.

## Understand preliminary or stale results

The review page uses the latest saved forecast snapshot when one is available. Without one, it builds a preliminary fallback forecast with zero opening cash and no listed inflows or outflows. Treat preliminary fallback figures as incomplete, not as a complete account forecast. A stale status means the result may no longer reflect current inputs.

If the page recommends review, check the freshness and data-quality status and make sure relevant source records and module inputs are current. The current Cash Plan settings page does not let you edit the displayed configuration, refresh a forecast, add cash-plan items, or change review-role assignments. Use other supported module workflows to maintain their own data, then review the resulting CashPlan status. Do not rely on the displayed figure as a bank balance or accounting ledger.

## Related guides

- [Tax Buffer](tax-buffer.md) — review reserve estimates that may affect cash posture.
- [CommitGuard](commitguard.md) — maintain tracked commitments.
- [RunwayGuard](runwayguard.md) — note that its current dashboard forecast is sample-like, not a verified live account forecast.
- [Connections and subscription](general-settings.md) — connect financial data sources.
