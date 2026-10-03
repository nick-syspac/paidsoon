## ADDED Requirements

### Requirement: Dashboard overview SHALL include MarginGuard summary module
The system SHALL include a concise MarginGuard summary in the FinOps dashboard overview showing gross margin, target margin, trend direction, alert count, and a navigation action to MarginGuard detail.

#### Scenario: Entitled user sees overview summary
- **WHEN** an entitled user loads dashboard overview
- **THEN** MarginGuard summary metrics render alongside existing module summaries with consistent formatting semantics

#### Scenario: Non-entitled user does not see summary
- **WHEN** user plan lacks MarginGuard access
- **THEN** MarginGuard summary is hidden or replaced with upgrade messaging consistent with existing gating patterns
