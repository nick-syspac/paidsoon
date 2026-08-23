# myob-go-live-runbook Specification

## Purpose
TBD - created by archiving change harden-myob-business-go-live. Update Purpose after archive.
## Requirements
### Requirement: MYOB environment-variable documentation is complete and canonical
The system documentation SHALL maintain a canonical MYOB environment-variable reference that covers local, preview, and production setup guidance for all MYOB-related configuration required to connect, sync, and operate the integration safely.

#### Scenario: Operator prepares a new environment for MYOB rollout
- **WHEN** an operator follows the canonical runbook for local, preview, or production setup
- **THEN** the documentation lists every required MYOB-related environment variable, states whether it is server-only or safe for browser exposure, and explains how the operator validates that the value is correctly configured

#### Scenario: Environment documentation and checked-in examples diverge
- **WHEN** MYOB-related environment variables differ across canonical runbooks and checked-in setup examples
- **THEN** the discrepancy is treated as a documentation failure that blocks MYOB go-live readiness until the sources are aligned

### Requirement: MYOB launch checklist uses explicit pass/fail gates
The MYOB go-live runbook SHALL define named launch gates with explicit pass/fail criteria, required evidence, and blocking status for any unmet gate.

#### Scenario: MYOB sandbox validation gate is assessed
- **WHEN** an operator reviews the sandbox validation gate
- **THEN** the runbook states what must pass, what evidence must be captured, and whether failure blocks private beta, public beta, or supported production launch

#### Scenario: First-sync validation gate is assessed
- **WHEN** an operator reviews the first-sync gate
- **THEN** the runbook states the required validation of invoice import, status mapping, and follow-up suppression behavior before the gate can be marked pass

### Requirement: MYOB launch readiness distinguishes rollout levels
The runbook SHALL distinguish at least three rollout states for MYOB: blocked, private beta, and supported production. Each state SHALL be determined by the documented gate outcomes rather than by subjective judgment alone.

#### Scenario: Not all gates are satisfied
- **WHEN** one or more mandatory MYOB launch gates have failed or remain unverified
- **THEN** the runbook classifies MYOB as blocked or beta-only according to the documented rollout rules and SHALL NOT describe the integration as supported production

#### Scenario: All production gates are satisfied
- **WHEN** every required gate for supported production is marked pass with evidence
- **THEN** the runbook permits MYOB to be described as a supported production invoice source

### Requirement: Go-live documentation aligns with product and support messaging
The MYOB runbook SHALL require alignment between go-live status, in-app messaging, marketing copy, and support expectations before a rollout level can be advanced.

#### Scenario: MYOB is exposed in product UI but still documented as planned
- **WHEN** the product UI offers MYOB connection or sync actions while public-facing documentation still describes MYOB as planned or coming soon
- **THEN** the documentation alignment gate fails until the rollout messaging is made consistent

#### Scenario: Support readiness is reviewed before launch
- **WHEN** MYOB is proposed for supported production launch
- **THEN** the runbook requires confirmation that support and admin tooling can identify connection state, inspect sync recency, and trigger remediation actions

