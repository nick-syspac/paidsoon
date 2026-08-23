## Context

See proposal.md for motivation. Current plan metadata enables weekly_summary_email for higher tiers, and several marketing/release surfaces present it as available. The weekly summary execution path exists as an internal job endpoint and worker schedule definition, but the live production deployment path does not currently provide an active weekly trigger in vercel.json. This creates an operational-state mismatch between entitlement/marketing claims and runtime behavior.

## Goals / Non-Goals

**Goals:**
- Ensure customer-facing claims for weekly summary align with production operational reality.
- Reuse existing implementation-state gating patterns to present weekly summary as coming soon until activation.
- Preserve internal route and worker code so activation can be restored without reimplementation.
- Define objective criteria for restoring available/live claims.

**Non-Goals:**
- Implementing or deploying a new production scheduler in this change.
- Refactoring weekly summary send logic.
- Altering billing prices, tier structure, or Stripe configuration.

## Decisions

1. Use implementation-state gating rather than entitlement removal.
- Decision: Keep weekly_summary_email entitlement boundaries in the plan catalog but mark operational state as unimplemented for presentation.
- Rationale: Prevents paid-feature claims while preserving intended tier boundaries and minimizing churn.
- Alternative considered: Remove feature entitlement booleans from tiers. Rejected because it conflates commercial packaging with temporary operational readiness.

2. Sweep all customer-facing availability claims, not only pricing.
- Decision: Update every surface that labels weekly summary as available/live/current scope.
- Rationale: Pricing-only rollback leaves contradictory claims in other high-visibility pages.
- Alternative considered: Restrict to pricing page only. Rejected due to residual misrepresentation risk.

3. Introduce a restore gate based on production evidence.
- Decision: Require explicit operational proof before re-listing weekly summary as available.
- Rationale: Avoids repeated claim drift and provides a repeatable policy for future feature rollouts.
- Alternative considered: Manual judgment with no formal gate. Rejected because it is brittle and audit-unfriendly.

## Risks / Trade-offs

- [Risk] Customers on eligible tiers may perceive temporary capability removal as a downgrade.
  - Mitigation: Use clear coming-soon wording and support messaging that explains activation is pending scheduler cutover.

- [Risk] Partial content updates leave inconsistent claims across pages.
  - Mitigation: Apply one coordinated claim sweep with a checklist of all identified surfaces.

- [Risk] Future teams re-enable claim text before operational readiness.
  - Mitigation: Add an explicit restore criterion in specs/tasks and include release checklist validation.

## Migration Plan

1. Mark weekly summary as unimplemented for presentation-state gating.
2. Update customer-facing pages and status lists to remove available/live/current claims for weekly summary.
3. Validate all touched surfaces for consistent coming-soon messaging.
4. Record restore criteria in change notes so re-enable requires production scheduler proof.
5. When scheduler is activated in production in a later change, re-open claims in a dedicated follow-up.

Rollback strategy:
- If rollback is needed, revert content/state-gating edits only; no data migration required.

## Open Questions

- Should roadmap/release messaging label weekly summary as planned or coming soon for consistency with other unimplemented paid features?
- Which team sign-off (product, ops, support) is required before restoring available/live claims after scheduler activation?
