## Why

The CashPlan foundation already computes a forecast, recommendations, and data-quality signals, but the product still lacks a clear user-facing entry point for those results. Owners can see the raw data model and API surface, yet they do not have a predictable place in the dashboard or settings area to review cash health, tune assumptions, or understand how the forecast is being generated.

That gap makes the feature feel incomplete even though the supporting logic exists. The product needs a consistent, tenant-scoped UI that presents CashPlan as an operational planning tool rather than a hidden backend capability.

## What Changes

- **NEW** CashPlan dashboard surface that surfaces low-point status, confidence, stale-data warnings, and recommended actions in the main authenticated dashboard experience
- **NEW** Settings area for CashPlan configuration, including forecast defaults, review frequency, and the user-visible operational controls needed to keep the plan current
- **NEW** dashboard-to-settings navigation and status messaging so users can move from “what is happening” to “how the plan is configured” without losing context
- **MODIFIED** existing dashboard and settings navigation so CashPlan appears alongside the rest of PaidSoon’s operational modules without confusing legacy placement

## Capabilities

### New Capabilities

- `cashplan-dashboard-settings`: Define the user-facing CashPlan dashboard and settings experience, including status summary, plan controls, action guidance, and configuration surfaces for tenant-scoped cash planning

### Modified Capabilities

- Empty

## Impact

- **UI**: Dashboard overview and settings panels for the CashPlan module, including status summaries, alerts, and configuration controls
- **Navigation**: Authenticated dashboard/settings navigation changes so users can access CashPlan consistently from both operational and config contexts
- **Data**: Uses the existing CashPlan forecast, recommendations, settings, and data-quality sources without altering the canonical financial facts layer
- **Security**: Continues to enforce tenant-scoped access and role boundaries for all dashboard and settings interactions
