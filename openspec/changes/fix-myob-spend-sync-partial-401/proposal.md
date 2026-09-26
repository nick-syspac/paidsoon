## Why

MYOB connections are currently succeeding for receivables sync while repeatedly failing spend-side endpoints with `401 OAuthTokenIsInvalid`, which produces persistent partial runs and prevents SpendLeak from receiving MYOB spend data. This creates operational noise and undermines trust because users see a healthy MYOB connection for invoice import but receive recurring spend-sync failures that cannot be resolved by retry alone.

## What Changes

- Expand the MYOB OAuth scope contract so connections intended for SpendLeak ingestion request and persist the full set of read scopes required by spend endpoints used in sync.
- Add scope-readiness checks for MYOB spend ingestion so the system distinguishes missing scope grants from generic token revocation.
- Keep receivables sync operational when spend scopes are missing, but record an explicit spend-scope-upgrade state with actionable reconnect guidance.
- Add reconnect and migration behavior for existing MYOB connections created before the scope expansion.
- Update runbook guidance to document required scopes, reconnect expectations, and validation steps.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- accounting-integrations: Update the MYOB OAuth requirements so the connection contract includes spend-read scopes required by SpendLeak ingestion and defines reconnect behavior when scope grants are incomplete.
- spendleak-ingestion: Add provider-scope readiness behavior so MYOB spend ingestion reports explicit scope-upgrade-required state instead of opaque token-invalid failures.

## Impact

- Affected code:
  - lib/providers/accounting/myob.ts
  - lib/providers/accounting/sync.ts
  - app/api/integrations/myob/callback/route.ts
  - components/settings/AccountingConnectionsClient.tsx
  - lib/settings/connectionFlash.ts
  - docs/runbooks/myob.md
- Affected systems:
  - MYOB OAuth consent and token grants
  - SpendLeak spend-side ingestion for MYOB tenants
  - User-facing connection status and support workflows
- Data and operations:
  - Existing MYOB connections may require reconnect to grant newly required scopes.
  - Sync run error telemetry will classify missing-scope failures separately from revoked-token failures.
