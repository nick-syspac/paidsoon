# MYOB Spend Scope Verification Evidence

## Execution Summary

- Date/Time (UTC):
- Environment (Local / Preview / Production-like):
- Operator:
- Commit SHA:
- MYOB app/API key identifier (redacted):
- Result: PASS | FAIL

## Scope Grant Verification

Granted scopes returned by callback token response (normalized):

- `sme-sales`
- `sme-contacts-customer`
- `sme-company-file`
- `sme-purchases`
- `sme-banking`
- `sme-general-ledger`
- `sme-contacts-supplier`

Observed missing scopes (if any):

- None | <list>

## Endpoint Coverage Matrix

| Endpoint family | Example endpoint | Expected scope | Outcome | Notes |
|---|---|---|---|---|
| Purchase bills | `/Purchase/Bill/Service` | `sme-purchases` | PASS/FAIL | |
| Banking transactions | `/Banking/Transaction` | `sme-banking` | PASS/FAIL | |
| General ledger accounts | `/GeneralLedger/Account?$filter=Classification eq 'Expense'` | `sme-general-ledger` | PASS/FAIL | |
| Supplier contacts | `/Contact/Supplier` | `sme-contacts-supplier` | PASS/FAIL | |

## Sync Behavior Checks

### 1) Incomplete-scope reconnect path

- Setup: reconnect with intentionally reduced scopes (where possible).
- Expected: connection remains receivables-capable; spend sync surfaces `scope_upgrade_required` guidance.
- Observed:

### 2) Full-scope reconnect path

- Setup: reconnect with full required scope set.
- Expected: spend-side sync imports bills, bank transactions, suppliers, and expense accounts; `scope_upgrade_required` state clears.
- Observed:

### 3) Revoked-token path

- Setup: revoke consent in MYOB app settings, then sync.
- Expected: unauthorized path still maps to revoked behavior.
- Observed:

## Evidence Attachments

Attach redacted artifacts:

- Callback redirect/code evidence (query params, sanitized)
- Latest connection row fields (status, scopes, lastSyncedAt)
- Latest accounting sync run rows (status + errorMessage)
- Server logs proving scope-upgrade classification and successful recovery after full-scope reconnect

## Final Decision

- Verification status: PASS | FAIL
- Follow-up actions required:
