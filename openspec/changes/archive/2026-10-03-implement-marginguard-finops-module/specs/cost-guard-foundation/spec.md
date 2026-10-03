## ADDED Requirements

### Requirement: CostGuard foundation SHALL provide reusable cost intelligence for MarginGuard
CostGuard foundational outputs for baselines, drift, and category-level cost movement SHALL be reusable by MarginGuard opportunity and impact detection flows.

#### Scenario: Cost drift reused for opportunity signal
- **WHEN** CostGuard baseline drift indicates significant delivery-cost increase
- **THEN** MarginGuard can reference that signal to generate explainable margin impact opportunities
