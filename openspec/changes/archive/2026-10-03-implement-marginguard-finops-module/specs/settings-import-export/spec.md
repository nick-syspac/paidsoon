## ADDED Requirements

### Requirement: Export settings SHALL include MarginGuard datasets
The import/export settings and export APIs SHALL include MarginGuard-supported exports (summary, trend, customer profitability, alerts) where user entitlement permits.

#### Scenario: MarginGuard export available to entitled user
- **WHEN** an entitled user opens export settings
- **THEN** MarginGuard export options are listed with format options supported by existing export infrastructure

#### Scenario: MarginGuard export blocked by entitlement
- **WHEN** a non-entitled user attempts MarginGuard export
- **THEN** export request is rejected using existing entitlement error semantics
