## Context

See proposal.md for motivation and scope. This change focuses on frontend product surfaces for SpendLeak and the dashboard overview integration, while reusing existing auth, tenancy, and dashboard routing conventions in the Next.js App Router codebase.

Current constraints:
- SpendLeak data models exist in schema/migrations, but user-facing SpendLeak dashboard surfaces are not yet implemented.
- Existing dashboard capabilities and auth behavior must remain intact.
- User-facing reads and actions must continue to flow through authenticated, RLS-safe backend paths.

## Goals / Non-Goals

**Goals:**
- Add a dedicated SpendLeak dashboard experience under /dashboard.
- Add evidence-first finding drill-downs and lifecycle UI states.
- Extend dashboard overview with a unified financial-operations summary that combines receivables and spend-side signals.
- Define robust frontend handling for empty, loading, stale, and partial-sync states.
- Provide testable frontend contracts for route behavior and core UI states.

**Non-Goals:**
- Building provider ingestion pipelines or detector heuristics.
- Redesigning global navigation outside dashboard context.
- Introducing a separate SpendLeak app, auth boundary, or tenancy model.
- Defining new subscription pricing or billing behavior.

## Decisions

### D1. Add SpendLeak as a first-class dashboard destination
- Decision: Introduce a dedicated SpendLeak route segment inside existing /dashboard navigation.
- Rationale: Keeps information architecture explicit and avoids overloading the current overview surface.
- Alternatives considered:
  - Embed everything into existing overview: rejected due to density and weaker drill-down discoverability.
  - Separate top-level app route outside dashboard: rejected due to auth/navigation duplication.

### D2. Use module + drill-down composition pattern
- Decision: Implement summary modules for key finding families, with each module linking to a detail panel/page.
- Rationale: Preserves scannability while still enabling evidence inspection.
- Alternatives considered:
  - Single large findings table only: rejected because it obscures category-level prioritization.
  - Modal-only details for all cases: rejected because large evidence payloads need flexible layout.

### D3. Treat data-state UX as a contract
- Decision: Explicitly design and test empty, initial-sync, stale-data, and error states for every major module.
- Rationale: Spend data availability will vary by connection and sync maturity; ambiguous states erode trust.
- Alternatives considered:
  - Generic fallback placeholder: rejected as too opaque for financial decisions.

### D4. Keep lifecycle actions optimistic-but-safe
- Decision: Use optimistic UI updates only after action eligibility checks, with immediate rollback on failure.
- Rationale: Balances responsiveness with correctness in tenant-scoped state transitions.
- Alternatives considered:
  - Full-page refresh after each action: rejected for poor operator workflow.
  - Fully optimistic without rollback: rejected for potential state drift.

### D5. Extend overview via additive section
- Decision: Add a dedicated unified financial-operations summary section to overview rather than modifying existing card semantics.
- Rationale: Minimizes regression risk in existing overview severity logic and click-through behavior.
- Alternatives considered:
  - Replace current four overview cards: rejected due to behavioral coupling with existing tests/specs.

## Risks / Trade-offs

- [Risk] Frontend ships before complete detector coverage, leading to sparse data states.
  - Mitigation: first-class empty/setup/stale states and clear copy that no insights are currently available.
- [Risk] Overview complexity increases with mixed receivables + spend messaging.
  - Mitigation: additive section with clear domain labels and direct navigation to SpendLeak detail surface.
- [Risk] Lifecycle actions diverge from backend state rules over time.
  - Mitigation: action availability derived from backend-provided state/permissions and covered by route tests.
- [Risk] Rendering cost increases on dashboard pages.
  - Mitigation: progressive loading boundaries and modular data requests per surface.

## Migration Plan

1. Add SpendLeak dashboard route shell and navigation entry behind existing authenticated dashboard flow.
2. Implement module scaffolds with canonical loading/empty/error/stale states.
3. Add drill-down detail views and lifecycle action controls.
4. Add unified financial-operations summary section on overview and overview-to-SpendLeak navigation.
5. Add/adjust tests for route access, state rendering, and integration behavior.
6. Roll out progressively; if regressions occur, disable SpendLeak entry point while preserving existing dashboard routes.

## Resolved Decisions

- SpendLeak route visibility is tier-gated at launch via `canAccessSpendLeak`, enabled for `small_business` and `accountant_partner`.
- Drill-down details use dedicated sub-routes (`/dashboard/spendleak/[id]`) for evidence-heavy findings.
- Data freshness uses a 24-hour threshold (`SPENDLEAK_STALE_THRESHOLD_HOURS = 24`) with stale/initial-sync/no-connection copy defined in `SPENDLEAK_STALE_COPY`.
