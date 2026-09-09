## ADDED Requirements

### Requirement: RunwayGuard capabilities are plan-gated
The system MUST map RunwayGuard features to existing subscription tiers and enforce both UI visibility and server-side access control for gated operations.

#### Scenario: Starter tier access
- **WHEN** a Starter tenant requests advanced scenario modeling
- **THEN** the server denies advanced scenario access while allowing the basic runway summary features assigned to Starter
