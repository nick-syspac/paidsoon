# MYOB Sandbox Verification Runbook (Task 15.7)

This runbook defines the manual pre-archive QA gate for OpenSpec task 15.7 in
`add-accounting-integrations`.

Goal:

- Verify the MYOB integration works end-to-end against a real MYOB developer
  sandbox company file.
- Confirm all invoice types are accessible under the configured scope.
- Confirm required MYOB headers (`x-myobapi-key`, `x-myobapi-version`) prevent
  auth-header-related 401 regressions.
- Capture auditable evidence for archive sign-off.

Use this runbook together with [myob.md](./myob.md).

## 1. Preconditions

Before running this gate, confirm:

1. A MYOB developer app exists with valid callback URI for your target
   environment.
2. The target environment has these vars configured: `MYOB_CLIENT_ID`,
   `MYOB_CLIENT_SECRET`, `MYOB_REDIRECT_URI`, `TOKEN_ENCRYPTION_KEY`.
3. You have access to a real MYOB sandbox company file.
4. The latest code for this change is deployed (or running locally) and includes
   task 15.1–15.6 fixes.

## 2. Scope Under Test

Required scope and behavior:

- Scope: `sme-sales` (invoice endpoints), `sme-contacts-customer` (contacts), and
  `sme-company-file` (required for company-file-scoped API access; the callback identifies
  the company file directly from the `businessId`/`businessName` it receives on redirect, not
  via a separate discovery endpoint).
- Invoice coverage required for pass:
  - Service
  - Item
  - Professional
  - TimeBilling
  - Miscellaneous

## 3. Test Procedure

### 3.1 Connect MYOB and trigger sync

1. Sign in to PaidSoon in the target environment.
2. Go to `Settings -> Connections`.
3. Click `Connect MYOB` and complete OAuth against the sandbox company file.
4. Confirm redirect returns to Connections with success state.
5. Click `Sync now` on the MYOB connection (or wait for first inline sync).

Expected:

- Connection status does not remain in persistent error for auth-header reasons.
- Sync completes or produces actionable non-auth errors.

### 3.2 Verify invoice type coverage

For each invoice type endpoint below, verify it is accessible and returns expected
shape with no auth-header 401:

- `{cf_uri}/Sale/Invoice/Service`
- `{cf_uri}/Sale/Invoice/Item`
- `{cf_uri}/Sale/Invoice/Professional`
- `{cf_uri}/Sale/Invoice/TimeBilling`
- `{cf_uri}/Sale/Invoice/Miscellaneous`

Validation points per endpoint:

1. HTTP status is successful (not 401 due to missing headers).
2. Response includes records (or an empty list when tenant has none).
3. At least one sample row (if present) includes `BalanceDue`.

### 3.3 Validate header regression is resolved

Confirm evidence shows requests were made with:

- `x-myobapi-key: <MYOB_CLIENT_ID>`
- `x-myobapi-version: v2`

Acceptable evidence methods:

- Redacted server logs that show outbound request headers metadata.
- Temporary debug instrumentation in non-production environments (removed after
  capture).
- Proxy capture in a secure environment with secrets redacted.

## 4. Evidence Capture Requirements

Attach all of the following to change notes or PR:

1. Timestamped execution summary (environment, operator, commit SHA).
2. Invoice type coverage matrix (template below).
3. Redacted request/response excerpts proving no auth-header 401 regression.
4. Pass/fail decision with short rationale.

### Coverage matrix template

| Invoice Type | Endpoint | Status | `BalanceDue` present | Notes |
|---|---|---|---|---|
| Service | `/Sale/Invoice/Service` | PASS/FAIL | Yes/No | |
| Item | `/Sale/Invoice/Item` | PASS/FAIL | Yes/No | |
| Professional | `/Sale/Invoice/Professional` | PASS/FAIL | Yes/No | |
| TimeBilling | `/Sale/Invoice/TimeBilling` | PASS/FAIL | Yes/No | |
| Miscellaneous | `/Sale/Invoice/Miscellaneous` | PASS/FAIL | Yes/No | |

## 5. Pass/Fail Criteria

Pass only when all are true:

1. All five invoice endpoints are reachable for the sandbox company file.
2. No endpoint fails due to missing/invalid MYOB auth headers.
3. `BalanceDue` is present and semantically correct in sampled invoice rows.
4. Evidence package is attached and redacted appropriately.

Fail when any of the above is not met.

## 6. If the Gate Fails

1. Record failure details and impacted endpoint(s).
2. Create a follow-up fix task with exact reproduction steps.
3. Do not archive the change until this gate passes.

## 7. Sign-off Record

Use this in PR/change notes:

```
MYOB Sandbox QA Gate (Task 15.7)
- Date/Time (UTC):
- Environment:
- Operator:
- Commit SHA:
- Result: PASS | FAIL
- Evidence links:
- Notes:
```
