## MODIFIED Requirements

### Requirement: Marketing pages MUST NOT claim a customer-facing capability that has no implemented, customer-facing counterpart
Marketing copy SHALL NOT describe a capability as available to customers unless a customer-facing implementation of that capability exists and is operational in the live production execution path.

#### Scenario: Audit trail claim matches actual scope
- **WHEN** a marketing page describes audit/activity logging
- **THEN** it does not claim a customer-facing audit trail UI or export exists unless one has shipped, and instead describes only the internal event logging that actually exists

#### Scenario: Weekly summary claim requires operational scheduler
- **WHEN** weekly debtor summary execution depends on a scheduled job path
- **THEN** customer-facing pages do not present weekly summary as available/live/included until a production scheduler path actively triggers weekly summary delivery
