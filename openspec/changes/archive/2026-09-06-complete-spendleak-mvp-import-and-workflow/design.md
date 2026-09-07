## Context

See proposal.md - Why.

SpendLeak currently ingests spend-side data from Xero/MYOB sync and persists findings with lifecycle states (`open`, `resolved`, `dismissed`, `snoozed`). The existing spreadsheet import stack is invoice-oriented and intentionally CSV-only, with schemas and commit logic tied to receivables models rather than SpendLeak spend models. The existing finding action API also does not support owner decision actions (`keep`, `cancel`, `renegotiate`, `ignore`) required by MVP item 6.

Constraints that shape this change:
- Tenant isolation must remain enforced through `withUserContext` for user-facing read/write operations.
- SpendLeak remains an analysis layer and must not mutate provider systems.
- Existing detector idempotency (`userId + findingType + subjectKey`) must remain stable.
- Import behavior must avoid duplicate spend records and avoid cross-tenant data exposure.

## Goals / Non-Goals

**Goals:**
- Add a SpendLeak-specific CSV/XLSX expense import lifecycle that ends in normalized spend records usable by existing detectors.
- Add explicit owner decision actions (`keep`, `cancel`, `renegotiate`, `ignore`) for findings.
- Persist decision metadata so reviewed outcomes are visible and auditable.
- Introduce suppression semantics for keep/ignore so unchanged findings are not resurfaced as fresh unresolved work.
- Keep SpendLeak dashboard/summary behavior grounded in persisted data.

**Non-Goals:**
- No contract-analysis features, renewal calendar rebuild, benchmark features, or AI-generated supplier outreach in this change.
- No replacement of existing Xero/MYOB spend sync path.
- No auto-application of cancellation or renegotiation to accounting providers.

## Decisions

### Decision 1: Create SpendLeak-specific expense import capability, not a polymorphic extension of invoice import
- Choice: Introduce a new SpendLeak expense-import route set and staging model contract rather than overloading invoice-import endpoints.
- Rationale: Invoice import semantics (customers, invoice numbers, due dates, reconciliation rules) do not match spend records and would create coupled validations and confusing UX.
- Alternatives considered:
  - Extend invoice-import with a mode switch (`invoice` vs `expense`): rejected due to schema complexity and higher regression risk in a production path.
  - Accept expense files directly into final spend tables: rejected because it bypasses review/validation safeguards.

### Decision 2: Reuse detection pipeline by committing import rows into normalized SpendLeak spend read models
- Choice: Expense import commit writes validated rows into the same normalized spend records consumed by `detectSpendFindings`.
- Rationale: A single detector input contract keeps rule behavior consistent across provider and imported sources.
- Alternatives considered:
  - Build parallel detector logic for imported files: rejected due to divergence risk and doubled maintenance.

### Decision 3: Separate lifecycle state from owner action metadata
- Choice: Add explicit persisted owner decision fields (action, actionedAt, actionedBy, optional note) while preserving lifecycle state for open/reopened/closed behavior.
- Rationale: Item 6 needs action semantics distinct from generic lifecycle toggles; keeping both supports clear UI labels and auditability.
- Alternatives considered:
  - Encode actions into state enum only: rejected because it collapses meaning, weakens audit history, and complicates reopening behavior.

### Decision 4: Suppression based on decision + evidence fingerprint
- Choice: Treat keep/ignore as suppressing decisions until a material evidence change (detected via stable evidence fingerprint/version comparison) reopens the item.
- Rationale: Prevents repetitive noise while allowing meaningful changes to re-enter review.
- Alternatives considered:
  - Permanent suppression after keep/ignore: rejected because it can hide emerging cost growth.
  - Time-based suppression only: rejected because unchanged evidence can still reappear after expiry.

### Decision 5: Expand SpendLeak action API with guarded transitions
- Choice: Extend SpendLeak finding action endpoint contract to accept the four MVP decision actions plus reopen, with transition validation and tenant ownership checks.
- Rationale: Preserves current RLS-safe pattern while adding required business actions.
- Alternatives considered:
  - Add standalone endpoint per action: rejected as unnecessary surface-area growth.

## Risks / Trade-offs

- [Risk] CSV/XLSX parsing differences create inconsistent normalized values (dates, currency, negative amounts).
  -> Mitigation: enforce strict canonical mapping, explicit parse errors, and deterministic normalization tests using mixed-format fixtures.

- [Risk] Suppression logic may under-surface legitimate changed findings or over-surface unchanged ones.
  -> Mitigation: evidence fingerprint strategy with explicit tests for unchanged vs materially changed scenarios.

- [Risk] Adding decision metadata to findings can break existing consumers expecting only state.
  -> Mitigation: additive schema change, backward-compatible API responses, and UI defaults for null decision fields.

- [Risk] Expense import can become a path for cross-tenant leakage through batch IDs.
  -> Mitigation: every batch/finding query scoped through authenticated user context and tested for cross-tenant denial.

## Migration Plan

1. Add schema migration for SpendLeak expense-import lifecycle and decision metadata fields/tables.
2. Deploy additive read/write API support while retaining existing state actions.
3. Release UI updates for expense import and owner decisions behind existing SpendLeak access checks.
4. Backfill defaults for existing findings (null action metadata).
5. Run targeted tests and OpenSpec validation before marking change apply-ready.

Rollback strategy:
- If issues emerge, disable new SpendLeak expense-import entry points and decision actions at route level while retaining additive schema.
- Existing Xero/MYOB SpendLeak ingestion and baseline state actions continue operating.

## Open Questions

- Should XLSX support be enabled at launch for all tiers with SpendLeak access, or gated behind the same entitlement boundary as invoice export (`csv_export`)?
- For `cancel` and `renegotiate`, should MVP require a mandatory note to capture intended follow-up context?