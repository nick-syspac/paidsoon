## ADDED Requirements

### Requirement: Stage selector
The UI SHALL provide a dropdown to select which reminder stage (1, 2, or 3) the user is currently editing. Stage labels SHALL be human-readable: "Stage 1 – Gentle Reminder", "Stage 2 – Firm Follow-up", "Stage 3 – Final Notice". Each stage SHALL load and save independently. The dropdown SHALL visually indicate which stages already have a custom saved template.

#### Scenario: Default stage on open
- **WHEN** the user opens the Templates settings tab
- **THEN** Stage 1 is selected by default and its content is loaded into the editor

#### Scenario: Switching stages
- **WHEN** the user selects a different stage from the dropdown
- **THEN** the editor content (subject, HTML body, plain text body) updates to reflect the saved template for that stage, or the system default if none exists

#### Scenario: Custom template indicator
- **WHEN** a stage has a saved custom template
- **THEN** the dropdown option for that stage SHALL display a visual indicator (e.g. a checkmark or dot)

---

### Requirement: Subject field
The editor SHALL include a single-line text input for the email subject. The subject input SHALL support variable insertion via the variable picker. The subject SHALL be pre-filled with the default subject for the selected stage when no custom template exists.

#### Scenario: Pre-fill on first open
- **WHEN** the user opens a stage that has no saved custom template
- **THEN** the subject field is pre-filled with the system default subject for that stage

#### Scenario: Variable insertion in subject
- **WHEN** the user selects a variable from the variable picker while the subject input has focus
- **THEN** the variable token (e.g. `{{invoiceRef}}`) is inserted at the cursor position in the subject field

---

### Requirement: Body editor tabs
The editor SHALL provide three independently editable tabs for the template body: "Visual" (WYSIWYG), "HTML", and "Plain text". The Visual and HTML tabs SHALL represent the same underlying HTML content and SHALL sync bidirectionally. The Plain text tab SHALL store a separate string that is not auto-generated from HTML.

#### Scenario: WYSIWYG to HTML sync
- **WHEN** the user edits content in the Visual tab
- **THEN** the HTML tab reflects the updated HTML output when the user switches to it

#### Scenario: HTML to WYSIWYG sync
- **WHEN** the user edits raw HTML in the HTML tab
- **THEN** the Visual tab reflects the parsed result when the user switches to it

#### Scenario: Plain text is independent
- **WHEN** the user edits the Plain text tab
- **THEN** the Visual and HTML tab content is not modified

---

### Requirement: WYSIWYG toolbar
The Visual tab SHALL include a formatting toolbar with at minimum: Bold, Italic, Underline, Bullet list, Numbered list, and Insert link. The toolbar SHALL also include a "Insert variable" dropdown.

#### Scenario: Bold formatting
- **WHEN** the user selects text and clicks Bold
- **THEN** the selected text is rendered in bold in the editor and the HTML output wraps it in `<strong>`

#### Scenario: Insert link
- **WHEN** the user selects text and clicks Insert link
- **THEN** the user is prompted for a URL and the selection becomes a clickable hyperlink

---

### Requirement: Variable picker
The editor SHALL include a variable picker that inserts supported template variables into whichever field or tab is currently active. Variables SHALL be presented as labelled options (e.g. "Client name", "Amount due") not as raw token syntax. Variables specific to Stage 3 SHALL only appear when Stage 3 is selected.

#### Scenario: Variable chip in WYSIWYG
- **WHEN** the user inserts a variable while in the Visual tab
- **THEN** the variable renders as a non-editable inline chip showing the human-readable label (e.g. "Client name"), not the raw `{{clientName}}` syntax

#### Scenario: Variable token in HTML tab
- **WHEN** the user inserts a variable while in the HTML tab
- **THEN** the raw token (e.g. `{{clientName}}`) is inserted at the cursor position

#### Scenario: Stage 3 variables hidden for other stages
- **WHEN** the user is editing Stage 1 or Stage 2
- **THEN** `{{daysOverdue}}` and `{{firmDeadline}}` do not appear in the variable picker

---

### Requirement: Pre-fill from system defaults
When a user opens a stage with no saved custom template, all fields (subject, HTML body, plain text body) SHALL be pre-filled with the system default content for that stage, using `{{variable}}` tokens for dynamic values.

#### Scenario: Fresh editor state
- **WHEN** the user has no saved template for a stage
- **WHEN** they open that stage
- **THEN** the editor contains the same content that would be sent by the default template

---

### Requirement: Reset to default
The editor SHALL include a "Reset to default" button. Activating it SHALL replace all fields for the current stage with the system defaults and SHALL delete any saved custom template for that stage from the database.

#### Scenario: Reset confirmation
- **WHEN** the user clicks "Reset to default"
- **THEN** the UI asks for confirmation before proceeding

#### Scenario: After reset
- **WHEN** the user confirms the reset
- **THEN** the editor is pre-filled with system defaults and the custom template record is deleted
- **THEN** the stage dropdown indicator for that stage is removed

---

### Requirement: Save template
The editor SHALL include a "Save template" button. Saving SHALL persist the current subject, HTML body, and plain text body for the selected stage. A success or error message SHALL be displayed.

#### Scenario: Successful save
- **WHEN** the user clicks "Save template" with a valid subject and non-empty body fields
- **THEN** the template is persisted and a success message is shown

#### Scenario: Validation failure
- **WHEN** the subject is empty or fewer than 3 characters
- **THEN** save is rejected and an inline error is shown without making a network request
