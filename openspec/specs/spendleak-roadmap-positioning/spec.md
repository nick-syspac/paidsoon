## ADDED Requirements

### Requirement: Public roadmap SHALL position SpendLeak as the spend-side companion to PaidSoon
The `/roadmap` page SHALL describe SpendLeak as a planned AI financial operations layer on top of
Xero and MYOB. The roadmap SHALL state that the accounting package remains the source of truth and
that SpendLeak focuses on analysis, recommendations, and cash-flow decisions.

#### Scenario: Visitor reads the roadmap page
- **WHEN** a visitor opens `/roadmap`
- **THEN** they can understand that PaidSoon addresses cash collection and SpendLeak addresses
  spend efficiency within a broader financial-operations direction

#### Scenario: Roadmap avoids misleading product claims
- **WHEN** the roadmap describes SpendLeak
- **THEN** it does not imply SpendLeak is already a standalone accounting package or that unbuilt
  later-stage features are already available

### Requirement: Roadmap SHALL separate initial SpendLeak MVP items from later ideas
The `/roadmap` page SHALL distinguish the first SpendLeak delivery slice from longer-term follow-on
ideas so prospects understand what is expected first versus what remains future exploration.

#### Scenario: Visitor reviews planned-next roadmap items
- **WHEN** a visitor reads the SpendLeak-related "planned next" section
- **THEN** recurring subscription detection, price increase detection, duplicate detection,
  renewal alerts, supplier spend dashboard, AI savings recommendations, and PaidSoon cash-flow
  integration are listed as the initial SpendLeak direction

#### Scenario: Visitor reviews later-stage roadmap items
- **WHEN** a visitor reads the later/future roadmap section
- **THEN** ideas such as benchmarking, identity-provider usage correlation, and deeper supplier
  risk analysis are clearly labeled as later-stage rather than immediate MVP scope