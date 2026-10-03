# Proposal

## Why

PaidSoon currently treats initial accounting sync timing inconsistently across connection flows. MYOB connections and Xero organisation-selection flows trigger a first sync immediately, but the single-organisation Xero callback can mark a connection as connected without running that first import, which leaves data freshness dependent on the daily cron or a manual Sync now action.

## What Changes

- Require every finalized accounting connection flow to trigger the first accounting sync immediately, regardless of provider or whether organisation selection was required.
- Clarify that a newly connected accounting connection remains in a first-sync state until the first sync attempt completes and surfaces its outcome.
- Preserve the existing daily cron sync and manual Sync now action as follow-up refresh mechanisms, not substitutes for the initial import.
- Align connection-status and sync-health behavior so the connections UI and diagnostics reflect whether the first sync has actually run.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `accounting-integrations`: connection finalization requirements change so all completed accounting connection flows trigger the first sync consistently and surface first-sync state accurately.
- `invoice-sync`: first-sync initiation behavior changes so the initial import is triggered immediately on connection finalization, while cron and manual sync continue to cover subsequent refreshes and retries.

## Impact

- Affected code: accounting OAuth callback and organisation-selection routes, initial connection status handling, sync diagnostics, and connections settings UX.
- Affected systems: Xero, MYOB, Vercel cron, and the shared accounting sync orchestrator.
- Backward compatibility: no API contract change for end users, but newly connected accounting sources will import immediately and expose first-sync failures sooner.
- Risks: external provider calls now happen consistently during connection finalization, so the change must preserve redirect reliability, sync idempotency, and sanitized error reporting.
