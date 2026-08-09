## ADDED Requirements

### Requirement: Internal staff can author training/help guides in admin

The system SHALL provide an admin-only Training Studio where internal staff can create and edit guides without changing application code. Authoring access SHALL require platform admin guard enforcement.

#### Scenario: Authorized staff creates a draft guide
- **WHEN** a platform admin opens Training Studio and selects "New Guide"
- **THEN** a new guide is created in `draft` state with editable title, summary, slug, audience, and content body
- **AND** the creation action is recorded in admin audit logs

#### Scenario: Unauthorized users cannot access authoring
- **WHEN** a non-admin or unauthenticated user requests a Training Studio authoring route or API
- **THEN** access is denied by server-side authorization checks
- **AND** no guide changes are persisted

### Requirement: Authoring supports structured instructional blocks

The editor SHALL support structured instructional content blocks suitable for training material rather than plain unstructured rich text only.

#### Scenario: Author inserts instructional block
- **WHEN** an authorized author inserts a block such as step, tip, or warning
- **THEN** the content is stored in structured form and can be rendered consistently in preview and published output
