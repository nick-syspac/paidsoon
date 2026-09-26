## 1. Scope Contract and Provider Logic

- [x] 1.1 Define the required MYOB spend-read scope set and centralize scope constants used by authorization URL generation and callback persistence.
- [x] 1.2 Update MYOB callback and connection persistence flow to retain granted scopes in a canonical format suitable for readiness checks.
- [x] 1.3 Add provider-level detection for spend-scope insufficiency so spend endpoint failures can be classified separately from generic revoked-token failures.

## 2. Sync Classification and Recovery Behavior

- [x] 2.1 Update spend-side sync orchestration to emit scope-upgrade-required partial failures when MYOB spend scopes are missing.
- [x] 2.2 Ensure connection status transitions do not mark MYOB connections revoked based solely on spend-side missing-scope failures when receivables remain healthy.
- [x] 2.3 Add regression coverage for these cases: receivables success + spend scope failure, reconnect with full scopes clears degraded state, true revoked token still maps to revoked behavior.

## 3. UX and Operational Guidance

- [x] 3.1 Add user-facing reconnect messaging for MYOB scope-upgrade-required state in connections settings and flash/error mappings.
- [x] 3.2 Update MYOB runbook documentation with required spend scopes, reconnect expectations for existing tenants, and troubleshooting flow.
- [ ] 3.3 Execute sandbox verification for MYOB spend endpoints under the updated scope contract and attach evidence to the change.
	Blocked pending live MYOB sandbox credentials/environment. Evidence template prepared at `openspec/changes/fix-myob-spend-sync-partial-401/sandbox-verification-evidence.md`.

## 4. Validation

- [x] 4.1 Run targeted tests for MYOB provider and accounting sync behavior.
- [x] 4.2 Run OpenSpec validation for this change in strict mode and resolve any schema or delta issues.
