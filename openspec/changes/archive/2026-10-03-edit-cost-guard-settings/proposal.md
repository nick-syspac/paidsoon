## Why

The Cost Guard settings page already reads persisted values from the database, but it is read-only. Users cannot tune the sensitivity, minimum materiality, lookback window, or digest frequency even though those values already exist in the data model and drive the risk heuristics. This leaves a clear gap between the product UI and the actual configuration surface the rest of the platform expects.

## What Changes

- **NEW** user-editable Cost Guard settings capability for alert sensitivity, minimum materiality, baseline lookback, and digest frequency
- **NEW** authenticated settings API that validates input and persists user-scoped updates through the existing tenant-aware database access layer
- **MODIFIED** the Cost Guard settings page to present editable controls instead of static display cards while preserving the current safe defaults
- **MODIFIED** the settings experience to keep the values consistent with the existing `CostGuardSetting` data model and RLS rules

## Capabilities

### New Capabilities
- `cost-guard-settings`: user-managed threshold and digest preferences for the Cost Guard experience

### Modified Capabilities
- None. This change creates a new capability rather than changing an existing spec requirement.

## Impact

- **Frontend**: the settings screen under `/dashboard/settings/cost-guard` becomes an interactive form
- **Backend**: a new authenticated route under the settings API area persists the user’s chosen values
- **Data access**: writes continue to use `withUserContext` so tenant isolation and RLS remain enforced
- **Product behavior**: saved settings immediately affect the operating thresholds used by Cost Guard alerts and summary digests
