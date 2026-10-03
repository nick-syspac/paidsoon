## Why

MYOB connections are currently succeeding for receivables sync while repeatedly failing spend-side endpoints, producing persistent partial runs and preventing SpendLeak from receiving complete MYOB spend data. Live endpoint triage now shows this is not only a scope-readiness problem:

- `Purchase/Bill/TimeBilling` returns deterministic `404` for MYOB Business company files.
- `/Banking/Transaction` returns deterministic `401 OAuthTokenIsInvalid` for the same refreshed token that succeeds against canonical banking endpoints.

This creates operational noise and undermines trust because users see a healthy MYOB connection for invoice import but receive recurring spend-sync failures that cannot be resolved by retry alone.

## What Changes

- Expand the MYOB OAuth scope contract so connections intended for SpendLeak ingestion request and persist the full set of read scopes required by spend endpoints used in sync.
- Add scope-readiness checks for MYOB spend ingestion so the system distinguishes missing scope grants from generic token revocation.
- Keep receivables sync operational when spend scopes are missing, but record an explicit spend-scope-upgrade state with actionable reconnect guidance.
- Add reconnect and migration behavior for existing MYOB connections created before the scope expansion.
- Correct MYOB spend endpoint contracts used by sync orchestration:
  - Remove unsupported purchase bill subtype requests.
  - Replace non-canonical banking endpoint usage with documented MYOB Business banking endpoints.
- Add deterministic normalization for canonical banking endpoint payloads so SpendLeak ingestion remains stable after endpoint correction.
- Update runbook guidance to document required scopes, reconnect expectations, and validation steps.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- accounting-integrations: Update the MYOB OAuth requirements so the connection contract includes spend-read scopes required by SpendLeak ingestion and defines reconnect behavior when scope grants are incomplete.
- spendleak-ingestion: Add provider-scope readiness behavior so MYOB spend ingestion reports explicit scope-upgrade-required state instead of opaque token-invalid failures, and align spend endpoint contracts with MYOB Business API compatibility.

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
  - Spend-side ingestion mapping will shift from a single banking transaction family to documented banking endpoint families.
