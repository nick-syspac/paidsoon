## ADDED Requirements

### Requirement: Guides use destination keys instead of raw PaidSoon routes

In-content product navigation links SHALL store stable destination keys. A resolver SHALL map destination keys to runtime routes.

#### Scenario: Valid destination key resolves to route
- **WHEN** rendered content contains a known destination key
- **THEN** the resolver maps it to the canonical route and label for the current application version

#### Scenario: Deprecated route remains stable through resolver update
- **WHEN** an underlying application route changes
- **THEN** existing guide content does not require mass text edits if resolver mapping is updated for the same destination key

### Requirement: Unresolved or unavailable destination keys fall back safely

If a destination key cannot be resolved or is unavailable to the current audience, navigation SHALL redirect to the top-level help topic.

#### Scenario: Unknown destination key
- **WHEN** a reader activates a link with an unknown destination key
- **THEN** the system redirects the reader to the top-level help topic instead of returning a dead route

#### Scenario: Destination key resolves to inaccessible route
- **WHEN** a destination key resolves to a route not allowed for the current viewer context
- **THEN** the system redirects to the top-level help topic
