## Context

See proposal.md for motivation and product goals. The implementation should be built as a bounded, tenant-scoped CashPlan module that consumes canonical financial facts from existing PaidSoon, SpendLeak, Cost Guard, and accounting integration sources without mutating those records. The design assumes the repo already has the tenancy, auth, billing, provider-sync, and dashboard patterns that power the rest of the product, so CashPlan should follow the same service boundaries and permission conventions.

## Goals / Non-Goals

**Goals:**
- Deliver a deterministic 13-week forecast with clear explainability and confidence scoring
- Support manual balances, planned items, and override-driven corrections without overwriting source data
- Provide a single owner review workflow with Base plan, scenario comparisons, and actionable recommendations
- Keep the forecast resilient during integration failures by using the last good snapshot and stale-state warnings

**Non-Goals:**
- Full general-ledger accounting or statutory reporting
- Automated payment execution or treasury workflows
- Multi-entity consolidation, currency hedging, or complex restructuring logic
- Machine-learning-driven recommendations in MVP; use versioned rules first

## Decisions

### 1. Forecast engine stays deterministic and versioned
The core engine will be implemented as a pure calculation pipeline from canonical cash facts and assumptions to a `forecast_snapshot` output. Every snapshot will keep `input_hash`, `engine_version`, and `assumption_set_id` so identical inputs always produce the same result, and each tenant gets one active Base plan in MVP.

**Why:** This gives the product explainability, auditability, and stable behavior across recalculations. It also makes reconciliation and regression testing straightforward.

**Alternatives considered:** A mutable in-memory plan store or DB-driven partial updates would be harder to audit and would make tests less deterministic. The versioned snapshot design is safer for owner trust and product review.

### 2. Source facts remain immutable; overrides are explicit and auditable
Imported values will be stored as canonical cash facts with provenance metadata, while corrections will be represented as overrides linked to the fact or plan item. Users will not edit the raw source record directly.

**Why:** This preserves source lineage and keeps imported data explainable. It also matches the project’s requirement to avoid silent mutation of external facts.

**Alternatives considered:** Direct mutation of imported rows or shadow copies would hide the truth and make reconciliation harder. An override model is safer and more reviewable.

### 3. Scenarios are deltas from a Base snapshot, not separate copies of the dataset
The scenario system will store typed changes (item, timing, rule, or assumption deltas) against a Base snapshot and rebase when Base inputs change.

**Why:** This makes scenario comparison efficient and reduces drift as the real plan evolves. It also meets the requirement that scenarios can be compared and promoted deliberately rather than copying the full plan.

**Alternatives considered:** Full duplicate plan copies would be easier to code but would create large divergence and rebase complexity. Deltas are better for trust and maintainability.

### 4. Action ranking uses rule-based evidence rather than opaque ML
Recommendations will be scored with a transparent formula combining forecast impact, urgency, likelihood, effort, and reversibility. The UI will expose the evidence behind the recommendation and hide the scoring mechanism from the user, but not the explanation text.

**Why:** The product promise requires explainability, and the repo’s operational style favors deterministic and auditable logic over complex black-box models.

**Alternatives considered:** Pure ML ranking or a hidden heuristic would be harder to trust and weaker for owner-facing decision support. A rule-based model is safer for MVP.

### 5. The feature is exposed through a self-contained module with existing repo conventions
The route and component structure should match the existing app patterns (`app/api`, `lib/`, `components/`) and use the same tenant-scoped auth+RLS conventions already enforced elsewhere in the codebase. API, settings, and recalculation jobs should sit behind the same user and role boundaries as other protected areas.

**Why:** This reduces integration risk and keeps CashPlan consistent with the repository’s architecture.

**Alternatives considered:** Creating a separate standalone service would increase operational complexity without any product benefit for this MVP.

## Risks / Trade-offs

- [Forecast clarity versus complexity] → Use a disciplined model with deterministic rules and visible assumptions; defer advanced probabilistic analysis to later phases.
- [Source quality variability] → Surface stale or missing data early, reduce confidence, and keep the last good snapshot visible rather than hiding bad data.
- [Scenario drift] → Require rebase checks and explicit promotion to Base so scenario states do not silently diverge from reality.
- [Alert fatigue] → Emit threshold transitions and material worsening only, with deduplication and state-based suppression
- [Data privacy and export sensitivity] → Treat exports and plan records as sensitive financial data with audit logging and restricted access

## Migration Plan

1. Add the new CashPlan tables and indexes behind tenant-scoped access patterns using the existing Prisma schema conventions.
2. Implement a canonical cash-fact normalization layer that accepts accounting, CSV, and manual sources without mutating source records.
3. Ship the deterministic weekly forecast engine with golden test fixtures and snapshot persistence.
4. Add settings, opening-cash confirmation, and manual planned-item flows.
5. Expose summary and detail APIs plus the Overview and Plan workspace surfaces.
6. Add scenario, alert, recommendation, and digest capability after the Base plan is trusted and visible to users.
7. Roll out in pilot mode with a clear stale-state and data-quality workflow before broad enablement.

## Open Questions

- Whether opening cash in MVP should come from accounting balances, user attestation, or a hybrid per provider and per tenant setup.
- The exact default receipt timing formula for PaidSoon predictions and how those predictions are labelled in the UI.
- Whether Base plan publication requires an Approver role in all tiers or only in governed tiers.

These questions should be resolved before final implementation commitment because they affect permissions, confidence defaults, and the setup UX; the current design assumes configurable defaults and a no-surprises preliminary mode until confirmed.
