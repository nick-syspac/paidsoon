## Context

See proposal.md for motivation. The current MYOB integration requests receivables-oriented scopes and then executes spend-side endpoint calls during shared sync orchestration. In production behavior, invoice ingestion can succeed while spend-side endpoint calls fail with `OAuthTokenIsInvalid`, producing repeat partial runs that are operationally noisy and not actionable for users.

The system already supports partial sync outcomes, encrypted token persistence, and reconnect/disconnect flows. The design must preserve receivables continuity while making spend-side scope insufficiency explicit and recoverable.

## Goals / Non-Goals

**Goals:**
- Ensure MYOB OAuth scope requirements match the spend endpoints currently called by spend-side sync.
- Distinguish missing-scope spend failures from global token revocation.
- Preserve receivables sync behavior for already-connected tenants while making spend readiness and remediation explicit.
- Provide deterministic reconnect guidance for support and users.

**Non-Goals:**
- Adding write-back or mutation behavior to MYOB provider endpoints.
- Reworking Xero scope strategy.
- Introducing new billing entitlements or plan gates for existing SpendLeak behavior.

## Decisions

### D1: Treat scope completeness as a first-class readiness contract
- Decision: Define and centralize required MYOB spend-read scopes, and persist/evaluate granted scopes against that set.
- Rationale: Current behavior conflates scope insufficiency with token invalidity, making recurring failures opaque.
- Alternatives considered:
  - Keep current behavior and only improve messaging: rejected because repeated sync failures remain structurally unresolved.
  - Disable all MYOB spend-side sync permanently: rejected because it drops expected SpendLeak capability for validly scoped tenants.

### D2: Preserve receivables continuity while isolating spend readiness failures
- Decision: If spend scopes are missing, keep receivables sync active and classify spend ingestion as scope-upgrade-required rather than revoked.
- Rationale: Invoice chasing must not regress for existing MYOB users while spend scopes are upgraded.
- Alternatives considered:
  - Mark whole connection revoked on spend-side 401: rejected because it breaks working receivables behavior and overstates severity.
  - Hard-fail entire sync job on missing spend scope: rejected because it creates avoidable customer impact.

### D3: Add explicit reconnect remediation state
- Decision: Surface a dedicated, user-actionable reconnect state for missing spend scopes in sync errors and settings UX.
- Rationale: Operators and users need a clear path to recover without manual token forensics.
- Alternatives considered:
  - Keep generic OAuthTokenIsInvalid wording: rejected due to ambiguity and repeated support load.

### D4: Migration-by-reconnect for pre-existing MYOB connections
- Decision: Do not mutate stored tokens directly; require normal reconnect to grant expanded scopes.
- Rationale: OAuth scope grants are provider-side consent artifacts and should be upgraded via explicit re-consent.
- Alternatives considered:
  - Silent token refresh expecting scope expansion: rejected because refresh does not grant scopes never consented.

### D5: Remove unsupported purchase bill subtype requests
- Decision: Treat MYOB purchase bills as a four-subtype family (`Service`, `Item`, `Professional`, `Miscellaneous`) and stop requesting `Purchase/Bill/TimeBilling`.
- Rationale: Live endpoint validation against the production-like company file consistently returns HTML `404` for `Purchase/Bill/TimeBilling`, while the other purchase bill subtypes return `200`.
- Alternatives considered:
  - Keep requesting TimeBilling and ignore 404 per run: rejected because this produces perpetual partial failures and operational noise.
  - Keep TimeBilling behind a tenant toggle: rejected until there is evidence MYOB Business exposes this subtype in supported company files.

### D6: Replace non-canonical banking transaction endpoint usage
- Decision: Replace `/Banking/Transaction` reads with documented MYOB Business banking families (`SpendMoneyTxn`, `ReceiveMoneyTxn`, `TransferMoneyTxn`, with optional `Statement`/`BankAccount` enrichment as needed by SpendLeak).
- Rationale: Live endpoint validation with a freshly refreshed token returns `401 OAuthTokenIsInvalid` on `/Banking/Transaction` while canonical banking endpoints return `200` for the same token.
- Alternatives considered:
  - Retry `/Banking/Transaction` with extra backoff: rejected because deterministic probes show endpoint-family mismatch, not transient propagation.
  - Keep current endpoint and suppress error reporting: rejected because it hides real data loss and blocks spend transaction ingestion.

### D7: Introduce banking payload normalization for canonical endpoints
- Decision: Add a normalization layer that maps canonical banking endpoint payloads (`AmountPaid`, `AmountReceived`, `TransferNumber`, `PaymentNumber`, `ReceiptNumber`, etc.) into the existing internal spend transaction shape.
- Rationale: Canonical endpoint payloads differ from fields currently expected by `getSpendBankTransactions`, so endpoint replacement requires explicit field mapping to avoid data-quality regressions.
- Alternatives considered:
  - Reuse existing `/Banking/Transaction` mapper unchanged: rejected because required fields are absent or differently named on canonical endpoints.

## Risks / Trade-offs

- [Risk] Required scope identifiers may vary from assumptions across MYOB endpoint families.
  - Mitigation: Validate against MYOB granular scope documentation and sandbox endpoint checks before rollout.

- [Risk] Existing tenants may continue to see partial runs until reconnect.
  - Mitigation: Add explicit scope-upgrade-required messaging and support runbook guidance.

- [Risk] Over-broad scope requests can reduce consent conversion.
  - Mitigation: Request only minimal read scopes needed by implemented endpoints and document rationale.

- [Risk] Switching banking endpoint families may change cardinality and duplicate characteristics of imported transactions.
  - Mitigation: Define deterministic source-id prefixing by endpoint family and add regression tests for idempotent upsert behavior.

- [Risk] Canonical banking endpoints may not expose `LastModified` consistently for incremental sync filtering.
  - Mitigation: Validate supported filter fields per endpoint family and document fallback strategy (bounded date window/full pull with dedupe) if needed.

## Migration Plan

1. Implement scope set expansion and readiness classification behind existing sync flow.
2. Deploy without forcing disconnects; continue receivables sync.
3. Surface reconnect guidance for tenants with incomplete spend scopes.
4. Run sandbox verification for spend endpoints under new scope contract.
5. Roll out endpoint-contract corrections for purchase bill and banking reads.
6. Monitor sync run telemetry for drop in recurring MYOB spend-side partial failures (`Purchase/Bill/TimeBilling` 404 and banking endpoint 401).

Rollback:
- Revert scope-readiness classification and spend-scope enforcement logic if regressions occur.
- Keep receivables sync path unchanged; no destructive data migration required.

## Open Questions

- Which canonical banking endpoint families should be included in the SpendLeak transaction feed by default (`SpendMoneyTxn`/`ReceiveMoneyTxn` only, or include `TransferMoneyTxn` and/or `Statement`)?
- What is the safest incremental-sync filter contract for each selected banking family (`LastModified`, `Date`, or bounded-window fallback)?
- Should the reconnect prompt be blocking for SpendLeak UI entry, or non-blocking with degraded-state banners only?
