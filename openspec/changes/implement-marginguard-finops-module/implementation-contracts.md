## MarginGuard Discovery Contracts

### 1. Capability Boundaries (Finalized)

- Snapshot cadence: default daily snapshots for all entitled tiers. Advanced historical retention windows may vary by plan later, but cadence remains daily for deterministic trend comparability.
- Product/service grouping source: primary dimension is canonical financial line categorization where available, with fallback to invoice-level category labels and then customer-level grouping when product/service granularity is absent.
- Alert inbox scope: phase-one module-scoped MarginGuard alerts under MarginGuard surfaces; normalized status and counts are exposed to FinOps overview, with later convergence to shared inbox as a non-breaking enhancement.

Boundary constraints:
- MarginGuard does not own transaction ingestion.
- MarginGuard reads canonical invoice/payment/spend records and writes only MarginGuard settings, classifications, snapshots, alerts, opportunities, and scenarios.
- MarginGuard never alters chase/reminder eligibility logic.

### 2. Canonical Data Source Contract

Revenue sources (read-only):
- FinancialInvoice
- TrackedInvoice (for paidsoon reminder context and state)

Cash collection/payment behavior sources (read-only):
- FinancialPayment
- TrackedInvoice paid/due metadata

Cost sources (read-only):
- ImportedBill
- ImportedBankTransaction
- SpendLeak and CostGuard category/cost intelligence outputs when available

Tenant/profile sources (read-only):
- UserProfile
- AccountingConnection

Cross-module signals (read-only integration inputs):
- CostGuard baseline drift and category movement
- SpendLeak removable-spend signals
- CommitGuard commitment context (future risk only, not realized cost)

### 3. API DTO Contract (Phase 1)

All routes:
- derive user from Supabase auth user
- enforce entitlement server-side
- execute tenant reads/writes via withUserContext
- return safe DTO shapes only

Summary DTO:
- period: { from, to, label }
- grossMarginPct: number | null
- grossProfitCents: number
- revenueCents: number
- directCostCents: number
- marginAtRiskCents: number
- customersBelowTargetCount: number
- alertsOpenCount: number
- completenessPct: number
- confidence: high | medium | low | insufficient_data
- status: healthy | watch | warning | critical | insufficient_data
- explainability: { formulaVersion, assumptions[] }

Trend DTO:
- periodPreset: 30d | 3m | 6m | 12m | fy | custom
- points: [{ periodStart, periodEnd, revenueCents, directCostCents, grossProfitCents, grossMarginPct, targetMarginPct }]
- comparison: { enabled, deltaGrossMarginPct, deltaGrossProfitCents }
- completeness: { pct, confidence }

Breakdown Row DTO (customer/product/category/invoice/job):
- key
- label
- scopeType
- revenueCents
- directCostCents
- grossProfitCents
- grossMarginPct
- targetMarginPct
- variancePct
- trendDeltaPct
- status
- completenessPct
- confidence

Customer Profitability DTO:
- customerId
- customerName
- revenueCents
- invoicedCents
- paidCents
- directCostCents
- grossProfitCents
- grossMarginPct
- targetMarginPct
- variancePct
- outstandingInvoicesCount
- avgPaymentDelayDays: number | null
- trendDeltaPct: number | null
- status

Alert DTO:
- id
- type
- severity: info | warning | critical
- status: open | acknowledged | resolved | dismissed
- title
- message
- scope
- evidence
- estimatedImpactCents: number | null
- confidence
- createdAt
- updatedAt

Settings DTO:
- enabled
- defaultPeriod
- targets: { orgTargetPct, warningPct, criticalPct }
- overridesSummary: { customer, productService, category, projectJob }
- notifications: { belowWarning, belowCritical, deterioration, negativeMargin, customerWarning, costIncrease, dataQuality }

Classification DTO:
- id
- sourceType
- sourceRef
- class: DIRECT_COST | VARIABLE_COST | OVERHEAD | EXCLUDED | UNCLASSIFIED
- origin: manual | rule | default
- overrideLocked
- updatedAt

Scenario DTO:
- id
- inputs
- outputs: { requiredPriceCents, expectedGrossProfitCents, expectedGrossMarginPct, variancePct }
- assumptions
- createdAt

### 4. Acceptance Criteria For Task Group 1

- Boundaries are explicit and implementation-safe.
- Canonical financial ownership is clear and non-duplicative.
- API DTOs provide enough structure for backend and UI to proceed in parallel.
