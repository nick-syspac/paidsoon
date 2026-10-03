## 1. Dashboard integration

- [x] 1.1 Add CashPlan status summary to the authenticated dashboard in the same pattern as other operational modules
- [x] 1.2 Wire in the low-point, confidence, freshness, and action-state signals from the existing CashPlan summary API
- [x] 1.3 Add clear dashboard links or entry points from status cards into the CashPlan review or settings workflow

## 2. Settings surface

- [x] 2.1 Create the CashPlan settings section in the existing settings layout and navigation
- [x] 2.2 Surface the tenant’s live CashPlan configuration and current status without creating a second source of truth
- [x] 2.3 Add the supported update and refresh controls needed to keep the plan current and reviewable

## 3. Validation

- [x] 3.1 Verify the dashboard and settings surfaces read from the same underlying CashPlan state and reflect stale or incomplete data correctly
- [x] 3.2 Check navigation flows and messaging for empty, stale, and low-confidence states
- [x] 3.3 Run the relevant repo checks for dashboard/settings and CashPlan behavior before marking the change complete
