## 1. Plan State And Claim Policy

- [x] 1.1 Mark weekly summary presentation state as unimplemented/coming soon while keeping commercial tier entitlement boundaries intact.
- [x] 1.2 Add or update policy comments/docs in the plan-gating layer to state that operational inactivity blocks available/live claims.

## 2. Customer-Facing Claim Sweep

- [x] 2.1 Update pricing comparison and related plan messaging so weekly summary is not shown as currently included/available.
- [x] 2.2 Update marketing homepage, features, and how-it-works surfaces to remove available/live wording for weekly summary.
- [x] 2.3 Update release-notes and roadmap available/current sections to avoid listing weekly summary as currently available.

## 3. Validation

- [x] 3.1 Run lint/build checks for touched files and verify no type or lint regressions.
- [x] 3.2 Manually verify all touched customer-facing pages present consistent coming-soon/planned messaging for weekly summary.
- [x] 3.3 Confirm no API or scheduler behavior changes were introduced in this rollback change.

## 4. Re-enable Readiness Contract

- [x] 4.1 Document objective restore criteria: active production scheduler path plus successful delivery evidence for at least one full weekly cycle.
- [x] 4.2 Link the restore criteria to follow-up scheduler cutover work so claim reactivation happens only after operational proof.
