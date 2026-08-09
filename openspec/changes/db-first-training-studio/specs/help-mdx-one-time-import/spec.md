## ADDED Requirements

### Requirement: Existing MDX help corpus is imported once into DB-backed content

The system SHALL provide a one-time import process for current help MDX files under `content/help` into the DB-backed training/help content model.

#### Scenario: MDX metadata maps to DB fields
- **WHEN** an importable MDX file contains frontmatter fields such as title and description
- **THEN** those fields are mapped to the corresponding DB content fields

#### Scenario: Slug continuity is preserved
- **WHEN** a source MDX help file has an existing help slug/path
- **THEN** the imported DB content preserves that slug unless a collision policy explicitly remaps it

### Requirement: Import process reports unsupported content and validation outcomes

The import process SHALL emit validation output for unsupported constructs, collisions, and failures.

#### Scenario: Unsupported construct is encountered
- **WHEN** an MDX file includes syntax or components unsupported by the target storage/rendering model
- **THEN** the importer flags the file for review and does not silently drop content

#### Scenario: Import completion report is generated
- **WHEN** one-time import run completes
- **THEN** a summary report is produced with counts of imported guides, skipped guides, and flagged guides
