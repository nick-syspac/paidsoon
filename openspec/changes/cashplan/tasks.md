## 1. Foundation and data model

- [x] 1.1 Define the CashPlan schema and migration plan for tenant-scoped plans, assumptions, snapshots, overrides, scenarios, alerts, and data-quality records
- [x] 1.2 Implement the canonical cash-fact normalization layer for balances, receivables, bills, payroll, tax, recurring spend, and manual items
- [x] 1.3 Add immutable source lineage and audit metadata handling across imported facts and override records
- [x] 1.4 Implement the settings model for currency, timezone, buffer rules, horizon, alert thresholds, and role permissions

## 2. Forecast engine

- [x] 2.1 Build the deterministic weekly forecast calculation from opening cash, inflows, and outflows using versioned assumptions and scenario deltas
- [x] 2.2 Add confidence scoring and data-quality evaluation for stale data, missing balances, unresolved due dates, and low-confidence receipts
- [x] 2.3 Persist forecast snapshots with input hashing, engine versioning, and snapshot traceability for each tenant plan
- [x] 2.4 Add recalculation triggers for source sync updates, manual overrides, settings changes, and expiry events

## 3. UX and review workflow

- [x] 3.1 Build the CashPlan overview shell with health summary, lowest-balance card, confidence indicator, freshness metadata, and recommended actions
- [ ] 3.2 Implement the Plan workspace with weekly grid, grouped inflows/outflows, detail drawer, and explainability panel for each total and item
- [ ] 3.3 Add the Calendar and Data quality tabs with risk highlighting, event drill-down, and remediation workflows
- [ ] 3.4 Implement manual planned-item creation and override flows with reason, owner, expiry, and audit metadata

## 4. Scenario and comparison experience

- [x] 4.1 Implement Base, Optimistic, Conservative, and custom scenario creation with delta-based storage
- [x] 4.2 Add scenario rebase detection, preview, and selective promotion to Base with complete audit logging
- [x] 4.3 Add scenario comparison UI showing absolute and percentage deltas for the low point, buffer gap, and weekly totals

## 5. Recommendations, alerts, and digest

- [ ] 5.1 Build rule-based recommendation ranking for delayed receipts, avoidable spend, planned purchases, and buffer risks
- [ ] 5.2 Implement alert state transitions and deduplication so warnings trigger only on material changes or threshold crossings
- [ ] 5.3 Add weekly digest generation for owners and assigned planners, including accepted actions and outstanding risks
- [ ] 5.4 Expose recommendation and alert history through the explainability and audit surfaces

## 6. API and integrations

- [x] 6.1 Implement summary, periods, items, settings, explanation, and export endpoints under the CashPlan API surface
- [x] 6.2 Add worker jobs for source sync, projection rebuild, recommendation evaluation, alerting, override expiry, and digest generation
- [ ] 6.3 Connect existing accounting and CSV import paths to CashPlan canonical facts while preserving source provenance and source failure states
- [ ] 6.4 Add integration tests for tenant isolation, deterministic forecast output, stale-source handling, and override semantics

## 7. Rollout readiness

- [ ] 7.1 Validate the CashPlan setup flow, preliminary status handling, and data-quality UX for incomplete opening cash or missing obligations
- [x] 7.2 Run the repo’s test and verification flow relevant to schema, auth boundaries, and forecast logic
- [ ] 7.3 Confirm accessibility requirements for keyboard use, labels, and non-colour risk cues in the core review journey
- [ ] 7.4 Review the pilot configuration, permissions model, and export retention policy before broader rollout
