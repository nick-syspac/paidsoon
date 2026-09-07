## Context

See proposal.md - Why.

SpendLeak already persists findings with review outcomes (`keep`, `cancel`, `renegotiate`, `ignore`), owner notes, estimated monthly/annual impact, and evidence metadata. The product also already has a robust invoice export implementation with CSV/XLSX generation, tenant-safe filtering patterns, and compatibility safeguards.

This change adds a SpendLeak-specific report export that carries analysis outputs only. It must not become a second accounting export subsystem.

## Goals / Non-Goals

**Goals:**

- Export currently filtered SpendLeak findings to CSV and XLSX.
- Include analysis and workflow fields needed for owner/accountant review.
- Keep CSV and XLSX outputs schema-identical and deterministic.
- Preserve auth, tenant isolation, and feature-gating conventions.
- Clearly communicate analysis-only scope in product/API messaging.

**Non-Goals:**

- No accounting journals or general-ledger formatted exports.
- No GST/BAS-ready tax exports.
- No Xero/MYOB import file formats.
- No bill migration files for other accounting products.
- No write-back from SpendLeak decisions to provider systems.
- No scheduled exports or PDF output in MVP.

## Decisions

1. Add a dedicated SpendLeak report export capability and route.
   - Choice: create a SpendLeak-specific export path rather than extending invoice export semantics.
   - Rationale: invoice exports are receivables records; SpendLeak exports are analysis findings and review decisions.
   - Alternative: one polymorphic "unified export" endpoint, rejected due to mixed semantics and higher regression risk.

2. Define "currently filtered" as the active SpendLeak findings scope.
   - Choice: MVP exports the same findings list represented by the current SpendLeak filter state.
   - Rationale: this matches user expectation of "export what I am looking at" and keeps MVP small.
   - Alternative: advanced multi-dimensional filter builder in MVP, rejected as unnecessary first complexity.

3. Use one shared export row dictionary for CSV and XLSX.
   - Choice: centralize field keys, headers, order, formatting, and sanitization rules.
   - Rationale: prevents CSV/XLSX drift and simplifies tests.
   - Alternative: independent mappers per format, rejected due to schema divergence risk.

4. Keep source-reference fields evidence-first and best-effort.
   - Choice: map source transaction/document references from persisted finding evidence and related normalized spend records when available; emit empty value when unavailable.
   - Rationale: not every detector produces the same evidence shape.
   - Alternative: forcing universal references across all finding types, rejected because it would degrade detector flexibility.

5. Preserve strict product boundary in labels and docs.
   - Choice: name the feature "Export SpendLeak Report" and document it as analysis export only.
   - Rationale: avoids customer confusion with accounting-system exports.
   - Alternative: generic "Export Expenses", rejected because it implies bookkeeping data portability.

## Export Schema (MVP)

Each row represents one SpendLeak finding in the current filtered result set.

- `finding_type`
- `supplier_or_counterparty`
- `description`
- `expense_category`
- `transaction_amount`
- `transaction_date`
- `detected_frequency`
- `monthly_cost`
- `annualised_cost`
- `potential_annual_saving`
- `spendleak_status` (review, keep, cancel, renegotiate)
- `owner_notes`
- `detection_confidence`
- `source_transaction_reference`
- `evidence_source`
- `detected_at`

Notes:

- `potential_annual_saving` is an estimate derived from persisted finding impact values and must be labeled as estimated in UI/help copy.
- `spendleak_status` is a presentation mapping over finding lifecycle state and review action.
- Missing optional evidence fields are exported as empty values rather than synthetic placeholders.

## Risks / Trade-offs

- [Risk] Some findings do not carry uniform category/reference evidence. -> Mitigation: best-effort extraction + explicit empty values + documented field semantics.
- [Risk] Users may treat estimated savings as guaranteed. -> Mitigation: labeling language in export and UI copy clarifies "potential" and "estimated".
- [Risk] Scope creep into accounting-export requests. -> Mitigation: explicit non-goals and route naming anchored to analysis report intent.
- [Risk] Large exports can strain memory/time. -> Mitigation: apply row ceiling and actionable error, mirroring invoice export behavior.

## Rollout Plan

1. Build shared SpendLeak export query + row mapper using tenant-scoped reads.
2. Implement CSV/XLSX generators with one field dictionary and spreadsheet injection safeguards.
3. Add SpendLeak dashboard export action wired to current filter parameters.
4. Add tests and docs; verify OpenSpec strict validation.

## Open Questions

- Should SpendLeak report export be gated by existing `csv_export` entitlement or a dedicated SpendLeak export feature flag?
- Should `description` default to finding summary when source description is unavailable, or remain empty to avoid conflating narrative and transaction text?
- Should the initial launch include the export action only on the SpendLeak dashboard, with Settings integration deferred?
