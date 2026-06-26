## ADDED Requirements

### Requirement: Resources page SHALL act as a content hub
The `/resources` page SHALL render a hub page linking to all available resource sections: Blog (`/blog`), Help Centre (`/help`), Documentation (`/docs`), FAQ (`/faq`), and Release Notes (`/release-notes`). Each section SHALL include a brief description.

#### Scenario: All resource links are present
- **WHEN** a visitor loads `/resources`
- **THEN** links to Blog, Help Centre, Documentation, FAQ, and Release Notes are all visible with descriptions

### Requirement: Resources page SHALL reference practical content categories
The `/resources` page SHALL reference at least two practical content categories relevant to the target audience, such as late payment email templates and cash flow management guides.

#### Scenario: Practical content categories are listed
- **WHEN** a visitor views `/resources`
- **THEN** at least two practical resource categories are visible

### Requirement: Resources page SHALL have unique page metadata
The `/resources` page SHALL export `generateMetadata` returning a unique `title` and `description`.

#### Scenario: Metadata is set
- **WHEN** the resources page is rendered server-side
- **THEN** the `<title>` tag contains a resources-specific title
