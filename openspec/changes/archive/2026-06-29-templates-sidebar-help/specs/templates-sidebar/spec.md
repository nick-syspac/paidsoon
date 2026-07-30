## ADDED Requirements

### Requirement: Stage guidance panel
The sidebar SHALL display a stage-specific guidance block above the variable list. The guidance SHALL update immediately when the user changes the stage selector. Each stage SHALL have a distinct tone label and 1–2 sentence description:
- Stage 1: "Gentle Reminder" — friendly, low pressure, assumes the invoice was overlooked.
- Stage 2: "Firm Follow-up" — professional, acknowledges the first reminder was sent, clearly requests action.
- Stage 3: "Final Notice" — direct and urgent, may reference consequences of non-payment.

#### Scenario: Stage 1 selected
- **WHEN** the stage selector is set to Stage 1
- **THEN** the sidebar guidance section SHALL display the Stage 1 tone label and description

#### Scenario: Stage changes to Stage 2
- **WHEN** the user changes the stage selector from Stage 1 to Stage 2
- **THEN** the sidebar guidance section SHALL immediately update to display Stage 2 tone label and description

#### Scenario: Stage 3 selected
- **WHEN** the stage selector is set to Stage 3
- **THEN** the sidebar guidance section SHALL display the Stage 3 tone label and description

---

### Requirement: Variable reference list
The sidebar SHALL display a list of all available template variables. Each entry SHALL show the variable chip (styled consistently with chips in the editor), the variable label, and a short description of its resolved value (e.g. "e.g. £1,250.00").

#### Scenario: Variables listed for Stage 1 or 2
- **WHEN** the stage selector is set to Stage 1 or Stage 2
- **THEN** the sidebar SHALL list exactly the non-stage3-only variables: clientName, invoiceRef, amountDue, dueDate, paymentLink, yourName

#### Scenario: Stage 3 variables appear only on Stage 3
- **WHEN** the stage selector is set to Stage 3
- **THEN** the sidebar SHALL additionally show daysOverdue and firmDeadline variables

#### Scenario: Stage 3 variables hidden on Stage 1
- **WHEN** the stage selector is set to Stage 1
- **THEN** daysOverdue and firmDeadline SHALL NOT appear in the sidebar

---

### Requirement: Clickable variable insertion
Each variable entry in the sidebar SHALL be clickable. Clicking a variable SHALL insert it at the current cursor position in the active editor tab (Visual, HTML, or Plain text).

#### Scenario: Insert into Visual tab
- **WHEN** the editor is on the Visual tab AND the user clicks a variable in the sidebar
- **THEN** the variable chip SHALL be inserted at the cursor position in the TipTap editor

#### Scenario: Insert into HTML tab
- **WHEN** the editor is on the HTML tab AND the user clicks a variable in the sidebar
- **THEN** the raw `{{token}}` string SHALL be inserted at the cursor position in the HTML textarea

#### Scenario: Insert into Plain text tab
- **WHEN** the editor is on the Plain text tab AND the user clicks a variable in the sidebar
- **THEN** the raw `{{token}}` string SHALL be inserted at the cursor position in the plain text textarea

#### Scenario: Editor not yet mounted
- **WHEN** a stage change is in progress (editor re-mounting) AND the user clicks a variable
- **THEN** the click SHALL be a no-op (no error thrown)

---

### Requirement: Sticky sidebar layout
The sidebar SHALL be sticky (CSS `position: sticky`) so it remains visible in the viewport as the user scrolls the body editor. The outer container SHALL use a two-column grid layout. The stage selector SHALL appear above both columns.

#### Scenario: Sidebar stays visible while scrolling
- **WHEN** the user scrolls down past the top of the body editor
- **THEN** the sidebar SHALL remain fixed in the viewport (sticky positioning)

#### Scenario: Stage selector above both columns
- **WHEN** the Templates tab is rendered
- **THEN** the stage selector SHALL appear above the two-column grid, spanning the full width
