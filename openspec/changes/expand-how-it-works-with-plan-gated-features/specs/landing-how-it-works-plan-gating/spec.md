## ADDED Requirements

### Requirement: How-it-works includes templates and AI steps
The landing page SHALL present a "How it works" workflow that includes reminder templates and AI integration in addition to reminder-sequence messaging.

#### Scenario: Visitor scans workflow cards
- **WHEN** a visitor views the "How it works" section on the homepage
- **THEN** the section includes at least one templates-focused workflow item and at least one AI-integration workflow item

### Requirement: Higher-plan workflow items are marked
Any workflow item in "How it works" that represents a higher-plan capability MUST display a visible asterisk marker next to its label.

#### Scenario: Visitor sees higher-plan item
- **WHEN** a higher-plan capability appears as a workflow item in the section
- **THEN** the item label includes an asterisk marker directly adjacent to the item text

### Requirement: Asterisk meaning is explained in section context
The homepage SHALL include explanatory copy in or immediately below the "How it works" section that defines the asterisk marker as higher-plan availability.

#### Scenario: Visitor needs marker clarification
- **WHEN** the visitor reads the "How it works" section containing asterisk-marked items
- **THEN** the section includes text explaining that asterisk-marked items are available on higher plans

### Requirement: Core reminder-sequence message is retained
The updated "How it works" section MUST continue to communicate the automated escalating reminder sequence.

#### Scenario: Visitor evaluates core value proposition
- **WHEN** the visitor reads the updated workflow section
- **THEN** the section still describes the escalating reminder flow rather than replacing it with unrelated feature-only messaging
