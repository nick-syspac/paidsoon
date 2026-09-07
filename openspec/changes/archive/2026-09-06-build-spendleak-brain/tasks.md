## 1. Spend-Side Ingestion

- [x] 1.1 Extend the accounting sync flow to fetch spend-side bills, bank transactions, supplier/contact details, and expense-account context for supported providers.
- [x] 1.2 Add idempotent upserts for the spend read models so repeated syncs refresh records instead of creating duplicates.
- [x] 1.3 Record spend-side sync outcomes and provider failures without mutating source systems.
- [x] 1.4 Add provider mapping and sync idempotency tests for the spend-side ingest path.

## 2. Deterministic Insight Engine

- [x] 2.1 Implement recurring spend, price increase, duplicate spend, renewal, supplier concentration, and cash-pressure detectors as deterministic rules over persisted spend data.
- [x] 2.2 Persist findings with stable subject keys, evidence payloads, estimated impact, and lifecycle state.
- [x] 2.3 Add detector tests that cover false-positive boundaries and cross-provider fixture shapes.

## 3. Grounded Summary Layer

- [x] 3.1 Implement owner-facing summary generation from persisted findings and evidence only.
- [x] 3.2 Add safe fallback behavior for empty, partial, or stale spend data.
- [x] 3.3 Add grounding and regression tests for the summary output.

## 4. Verification and Documentation

- [x] 4.1 Update `docs/HLD.md` and `docs/DDD.md` so the spend brain architecture is documented accurately after implementation.
- [x] 4.2 Run focused tests for ingest, detectors, and summary generation.
- [x] 4.3 Run lint, typecheck, and `openspec validate build-spendleak-brain --strict` before marking the change ready.