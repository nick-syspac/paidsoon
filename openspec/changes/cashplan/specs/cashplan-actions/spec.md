# cashplan-actions Specification

## Purpose
Define the recommendation and alert system that prioritises the few actions most likely to improve an owner’s cash position without replacing good decision-making.

## Requirements

### Requirement: Action ranking and explainability
The system SHALL generate ranked recommendations using forecast impact, urgency, effort, likelihood, and reversibility, and SHALL explain the evidence behind each recommendation.

#### Scenario: Near-term risk is detected
- **WHEN** a forecast breach, delayed receipt, or avoidable recurring charge threatens the plan
- **THEN** the system surfaces a ranked recommendation with impact estimate, timeline, and supporting evidence

### Requirement: Alert transitions
The system SHALL issue alerts only on threshold state changes or material worsening and SHALL suppress duplicate notifications while preserving an audit trail.

#### Scenario: Buffer breach first occurs
- **WHEN** the projected closing cash falls below the configured buffer threshold
- **THEN** the system triggers a single actionable alert with a clear transition from safe to at-risk status

### Requirement: Weekly digest and accepted actions
The system SHALL provide a weekly digest of the most relevant upcoming obligations, risk changes, and accepted actions for the owner or assigned planner.

#### Scenario: Owner accepts an action
- **WHEN** the owner accepts or assigns a recommendation
- **THEN** the system records the outcome and includes it in the relevant digest or follow-up workflow
