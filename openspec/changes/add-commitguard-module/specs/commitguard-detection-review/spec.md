## Purpose

Define deterministic commitment detection and review workflows so inferred obligations are explainable, configurable, and user-governed before becoming confirmed commitments.

## ADDED Requirements

### Requirement: CommitGuard SHALL detect candidate commitments with deterministic rules
The detection service SHALL infer candidate recurring commitments from repeat supplier intervals, amount variance thresholds, and minimum occurrence counts using configurable thresholds.

#### Scenario: Strong monthly recurrence signal
- **WHEN** at least three payments from the same supplier recur at approximately monthly intervals within configured tolerance
- **THEN** the system creates a detected commitment candidate with inferred recurrence and confidence metadata

#### Scenario: Evidence below threshold
- **WHEN** recurring evidence does not meet configured minimum rules
- **THEN** no candidate is created

### Requirement: CommitGuard SHALL support a review queue with rejection memory
Detected candidates SHALL enter a review queue where users can confirm, ignore, edit, or mark not-a-commitment, and rejected candidates SHALL not be repeatedly re-suggested without materially new evidence.

#### Scenario: User rejects candidate
- **WHEN** a user marks a detected item as not a commitment
- **THEN** the system records rejection context and suppresses repeat suggestions unless new evidence passes configured change criteria

#### Scenario: User confirms candidate
- **WHEN** a user confirms a detected candidate
- **THEN** the candidate becomes an active commitment and confidence is marked CONFIRMED
