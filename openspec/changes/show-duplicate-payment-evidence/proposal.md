# Proposal

## Why

The `duplicate_payment` detail currently shows aggregate comparison fields but not the two transactions that caused the finding. Its evidence payload contains transaction IDs and a counterparty, while the presentation expects supplier/bill fields or a `recentTransactions` list; as a result, useful values appear as unavailable and users cannot verify the suspected duplicate at a glance.

## What Changes

- Include source-linked evidence rows for the exact two bank transactions that triggered each duplicate-payment finding.
- Update the Duplicate comparison detail to show those transactions in a readable, responsive table with date, amount, description, counterparty, and source-record reference.
- Use the counterparty value in the comparison summary, and preserve explicit fallbacks for older or partial findings that lack transaction rows.
- Keep raw evidence and existing finding lifecycle controls available.

Out of scope: expanding the detector to show all nearby transactions, changing which pairs qualify as duplicates, adding a transaction lookup API, changing lifecycle actions, or migrating persisted findings.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `spendleak-insight-drilldowns`: duplicate-payment details show the source-linked transactions that triggered the finding, while partial/legacy evidence remains safely viewable.

## Impact

- Affected code: `lib/spendleak/engine.ts`, `lib/dashboard/spendleakPresentation.ts`, and `components/dashboard/spendleak/SpendLeakEvidenceDetails.tsx`.
- Affected tests: SpendLeak engine, presentation, and evidence-detail tests.
- No API, database schema, dependency, or migration change is expected; findings remain tenant-scoped and only evidence already belonging to the loaded finding is displayed.
- Older persisted findings may not contain the new transaction rows and must retain clear fallback values rather than inventing details.