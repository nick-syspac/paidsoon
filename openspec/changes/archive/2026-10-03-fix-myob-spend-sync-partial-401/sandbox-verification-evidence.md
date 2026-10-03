# MYOB Spend Scope Verification Evidence

## Execution Summary

- Date/Time (UTC): 2026-09-30T22:34Z to 2026-09-30T22:42Z
- Environment (Local / Preview / Production-like): Production-like (live MYOB Business company file connection)
- Operator: Syspac support operator
- Commit SHA: local workspace triage run (no code changes executed)
- MYOB app/API key identifier (redacted): configured app key via `MYOB_CLIENT_ID`
- Result: FAIL (scope grant complete, endpoint compatibility mismatch remains)

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
| Purchase bills | `/Purchase/Bill/Service` | `sme-purchases` | PASS | Fresh token returns 200 with items payload |
| Purchase bills | `/Purchase/Bill/TimeBilling` | `sme-purchases` | FAIL | Deterministic HTML 404 in repeated probes |
| Banking transactions (current code path) | `/Banking/Transaction` | `sme-banking` | FAIL | Deterministic 401 `OAuthTokenIsInvalid` even with fresh token |
| Banking transactions (canonical docs path) | `/Banking/SpendMoneyTxn` | `sme-banking` | PASS | 200 with transaction payload |
| Banking transactions (canonical docs path) | `/Banking/ReceiveMoneyTxn` | `sme-banking` | PASS | 200 with transaction payload |
| Banking transactions (canonical docs path) | `/Banking/TransferMoneyTxn` | `sme-banking` | PASS | 200 with transaction payload |
| General ledger accounts | `/GeneralLedger/Account?$filter=Classification eq 'Expense'` | `sme-general-ledger` | PASS | 200 with account payload |
| Supplier contacts | `/Contact/Supplier` | `sme-contacts-supplier` | PASS | 200 with supplier payload |

## Sync Behavior Checks

### 1) Incomplete-scope reconnect path

- Setup: reconnect with intentionally reduced scopes (where possible).
- Expected: connection remains receivables-capable; spend sync surfaces `scope_upgrade_required` guidance.
- Observed:

### 2) Full-scope reconnect path

- Setup: reconnect with full required scope set.
- Expected: spend-side sync imports bills, bank transactions, suppliers, and expense accounts; `scope_upgrade_required` state clears.
- Observed: scope set is complete and persisted, but sync remains partial due to endpoint compatibility mismatches (`bills:MYOB 404` and `bank-transactions:MYOB 401`). Suppliers and expense-account-family endpoints succeed under fresh token.

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

- Verification status: FAIL
- Follow-up actions required:
	- Remove unsupported `Purchase/Bill/TimeBilling` subtype request from spend bill ingestion.
	- Replace `/Banking/Transaction` with canonical banking endpoint families and add normalization mapping.
	- Re-run this evidence gate after endpoint contract correction.
