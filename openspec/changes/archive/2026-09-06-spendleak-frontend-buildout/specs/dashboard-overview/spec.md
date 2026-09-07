## ADDED Requirements

### Requirement: Unified financial operations summary
The dashboard overview SHALL include a unified financial operations summary that presents receivables-side and spend-side signals together in a single summary section.

#### Scenario: User has both receivables and spend-side data
- **WHEN** an authenticated user with both data domains views the dashboard overview
- **THEN** the overview renders combined summary content that distinguishes cash-in and cash-out metrics

#### Scenario: User has receivables data but no spend-side data
- **WHEN** the overview has receivables metrics but no spend-side findings
- **THEN** the receivables summary remains visible and the spend-side portion renders an explicit empty or setup state

### Requirement: SpendLeak summary navigation from overview
The overview SHALL provide clear navigation from spend-side summary elements to the dedicated SpendLeak dashboard surface.

#### Scenario: User selects spend-side summary call to action
- **WHEN** a user clicks a spend-side summary element on overview
- **THEN** the system navigates to the SpendLeak dashboard route with context-preserving filters when available
