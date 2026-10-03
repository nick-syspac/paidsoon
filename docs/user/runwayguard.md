# RunwayGuard

RunwayGuard is intended to summarize usable cash, protected cash, runway, and cash-exhaustion risk. Its core access starts on **Business Control**; Essentials does not include RunwayGuard. The plan catalog includes scenario access on **Small Business** and **Business Pro**.

## Important: current dashboard figures are illustrative

The current RunwayGuard dashboard’s forecast summary, cash-out estimate, confidence score, drivers, recommendations, and status calculation are built from fixed sample inputs and a fixed forecast series. They are **not a confirmed live forecast of your account**, even if you have entered settings or connected data. The user-specific cash, protected-cash, runway-days, confidence, and status fields are currently unavailable from the settings service. Do not use the displayed sample-like output to make financial decisions; verify cash and obligations against your own records.

The dashboard may prompt you to add cash-plan data or connect source data. Those are setup suggestions, not confirmation that the current RunwayGuard forecast is using those records.

## Configure RunwayGuard settings

Open **Settings → RunwayGuard** at `/dashboard/settings/runway-guard`. Set the controls and select **Save settings**:

- **Module status:** enable or disable the forecast without deleting runway history.
- **Forecast horizon:** choose 30, 60, 90, 180, or 365 days.
- **Risk thresholds:** set warning and critical thresholds in days. Critical must be lower than warning.
- **Minimum confidence:** set the minimum confidence between 0 and 1.
- **Low-confidence weight:** set how much weaker inflow signals affect a risk assessment, from 0 to 1.

The dashboard’s **Forecast inputs** panel shows the current horizon, warning/critical thresholds, and minimum confidence. Its **Usable cash**, **Runway**, and **Protected cash** cards are intended to show account forecast inputs, but the current settings service returns these data fields as unavailable; do not interpret the cards as a live CashPlan feed.

## Review the module

Open `/dashboard/runway-guard` and review the data-completeness prompt and settings before interpreting the page. Treat any forecast summary, status, drivers, and next actions as illustrative until the product confirms that account-specific data is powering them. Changing thresholds or confidence settings does not turn the sample calculation into a verified account forecast.

For current cash-plan status, review [CashPlan](cashplan.md). For reserves and estimated tax obligations, see [Tax Buffer](tax-buffer.md). This guide does not provide financial advice.
