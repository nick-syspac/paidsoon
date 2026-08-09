## ADDED Requirements

### Requirement: Help/training search uses DB-backed published content

The system SHALL provide a search path over DB-backed content and SHALL not rely on file-source indexing as the canonical source after cutover.

#### Scenario: Search returns published matches
- **WHEN** a user searches for a term present in a published guide title, summary, or body
- **THEN** the guide appears in search results ordered by relevance policy

#### Scenario: Unpublished guides are excluded
- **WHEN** a guide is in `draft` or `review` state
- **THEN** the guide is excluded from reader search results

### Requirement: Search applies audience visibility filters

Search results SHALL be filtered by audience visibility for the requesting user context.

#### Scenario: Public user cannot discover signed-in guide through search
- **WHEN** an unauthenticated request searches for terms that match only signed-in guides
- **THEN** those guides are not included in results

#### Scenario: Signed-in user can discover signed-in guides through search
- **WHEN** an authenticated request searches for terms that match signed-in guides
- **THEN** matching published signed-in guides may be included in results
