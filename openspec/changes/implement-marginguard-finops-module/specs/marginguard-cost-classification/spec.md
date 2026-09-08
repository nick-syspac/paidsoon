## Purpose

Define how MarginGuard classifies costs without duplicating financial transactions, including rule-based automation and explicit manual override precedence.

## ADDED Requirements

### Requirement: MarginGuard SHALL classify canonical costs by metadata
The system SHALL classify canonical expense or transaction records as `DIRECT_COST`, `VARIABLE_COST`, `OVERHEAD`, `EXCLUDED`, or `UNCLASSIFIED` using metadata attached to canonical records.

#### Scenario: Classification stored without data duplication
- **WHEN** a user classifies an expense as direct cost
- **THEN** MarginGuard stores classification metadata referencing the canonical transaction and does not create duplicate expense records

### Requirement: Manual classification SHALL override automatic rules
The system SHALL apply automatic rules by priority, but any explicit manual classification SHALL take precedence until explicitly changed by a user.

#### Scenario: Manual override preserved
- **WHEN** a rule maps supplier AWS to VARIABLE_COST and user sets one transaction to OVERHEAD
- **THEN** subsequent rule evaluations keep that transaction as OVERHEAD until manual override is cleared or changed

### Requirement: Classification changes SHALL be auditable
The system SHALL record classification and rule lifecycle events with actor, timestamp, prior value, and new value.

#### Scenario: Rule update audit event
- **WHEN** a user changes a classification rule priority
- **THEN** MarginGuard stores an audit event containing old and new priority values
