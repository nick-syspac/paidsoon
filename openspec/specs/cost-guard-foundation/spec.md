# cost-guard-foundation Specification

## Purpose

Define the foundation for the Cost Guard capability: a read-only, tenant-scoped cost intelligence layer that sits on the shared financial data model and supports deterministic cost-risk detection.

## Requirements

### Requirement: Cost Guard SHALL use the shared financial data layer
The system SHALL build Cost Guard on the same normalized transaction, supplier, and category datasets used by the rest of the financial-operations platform instead of creating a parallel cost ledger.

#### Scenario: Supplier aggregation is calculated from normalized data
- **WHEN** a user opens the Cost Guard overview
- **THEN** the system reads supplier and category totals from the shared financial dataset and not from a separate Cost Guard-only table

#### Scenario: Provider source metadata is preserved
- **WHEN** a spend record is analyzed in Cost Guard
- **THEN** the system includes provenance details such as source system, source ID, and synced timestamp so the underlying evidence remains traceable

### Requirement: Cost Guard SHALL remain read-only in MVP
The system SHALL not write back to accounting or procurement systems during the MVP release. Cost Guard SHALL provide alerts and forecast visibility without acting as an expense-management or AP tool.

#### Scenario: A cost spike is detected
- **WHEN** the system creates a Cost Guard alert
- **THEN** the alert is created in the Cost Guard layer only and does not mutate the source accounting record

### Requirement: Cost Guard SHALL support tenant isolation
The system SHALL ensure every Cost Guard table, alert, baseline, forecast, and rule is tenant-scoped and accessible only through the active tenant context.

#### Scenario: Cross-tenant query attempt
- **WHEN** a user attempts to query another tenant's Cost Guard data
- **THEN** the system returns no data and the query remains blocked by RLS or tenant filters

### Requirement: Cost Guard SHALL provide explainable baselines
The system SHALL calculate and persist baseline values for suppliers and categories using historical periods with both average and median values.

#### Scenario: One outlier invoice distorts a period
- **WHEN** a single large charge exists in the historical sample
- **THEN** the system stores the median baseline and uses it as a stable reference point alongside the average

## Acceptance Criteria

- Cost Guard can be loaded from shared financial data without a parallel ledger
- Every alert is tied to a supplier or category and a baseline
- Every Cost Guard entity remains tenant-scoped
- Cost Guard is read-only in MVP
- Baseline calculations are persisted and explainable
