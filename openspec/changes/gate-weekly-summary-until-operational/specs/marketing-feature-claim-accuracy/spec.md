## MODIFIED Requirements

### Requirement: Marketing pages MUST NOT claim a customer-facing capability that has no implemented, customer-facing counterpart
Marketing copy SHALL NOT describe a capability as available to customers unless a customer-facing implementation of that capability exists and is operational in the live production execution path.

#### Scenario: Audit trail claim matches actual scope
- **WHEN** a marketing page describes audit/activity logging
- **THEN** it does not claim a customer-facing audit trail UI or export exists unless one has shipped, and instead describes only the internal event logging that actually exists

#### Scenario: Weekly summary claim requires operational scheduler
- **WHEN** weekly debtor summary execution depends on a scheduled job path
- **THEN** customer-facing pages do not present weekly summary as available/live/included until a production scheduler path actively triggers weekly summary delivery

### Requirement: Release and roadmap status labels MUST reflect operational state for paid features
Customer-facing status surfaces that describe what is available today SHALL align with operational reality for paid capabilities and SHALL NOT classify a capability as live or current when it is not running automatically in production.

#### Scenario: Release notes current scope excludes non-operational weekly summary
- **WHEN** weekly debtor summary is not operationally triggered in production
- **THEN** release notes and similar current-scope sections do not list weekly debtor summary as currently available

#### Scenario: Roadmap available list excludes non-operational weekly summary
- **WHEN** weekly debtor summary remains operationally inactive in production
- **THEN** roadmap sections labeled available/live/private beta do not list weekly debtor summary as available
