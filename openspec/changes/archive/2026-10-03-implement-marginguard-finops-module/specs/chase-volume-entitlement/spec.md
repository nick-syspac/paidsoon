## ADDED Requirements

### Requirement: Chase-volume entitlement behavior SHALL remain unchanged by MarginGuard
MarginGuard integration SHALL not alter chase-volume invoice hold/unhold logic, and SHALL treat held invoice context as an informational input for profitability interpretation.

#### Scenario: Held invoice appears in margin context only
- **WHEN** an invoice is held due to chase-volume limit
- **THEN** MarginGuard may include its revenue/cash-behavior context in analysis but does not modify reminder eligibility decisions
