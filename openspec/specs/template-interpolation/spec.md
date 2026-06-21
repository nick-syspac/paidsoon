# template-interpolation Specification

## Purpose
TBD - created by archiving change custom-reminder-templates. Update Purpose after archive.
## Requirements
### Requirement: Shared interpolation engine
The system SHALL provide a single `interpolate(template: string, vars: ResolvedTemplateVars): string` function in `lib/email/templates.ts`. This function SHALL replace all `{{token}}` occurrences with their corresponding resolved values. Both built-in default templates and user custom templates SHALL pass through this function at send time.

#### Scenario: Token replacement
- **WHEN** `interpolate("Hi {{clientName}}, your invoice for {{amountDue}} is due.", vars)` is called with `clientName = "Sarah"` and `amountDue = "£4,500.00"`
- **THEN** the result is `"Hi Sarah, your invoice for £4,500.00 is due."`

#### Scenario: Unknown tokens are preserved
- **WHEN** the template contains a token with no matching key in vars
- **THEN** the token is left unchanged in the output (not replaced with empty string)

---

### Requirement: Default template strings with placeholders
The system SHALL define static default template strings for Stage 1, Stage 2, and Stage 3 as constants — one subject, one HTML body, and one plain text body per stage. These strings SHALL use the `{{token}}` syntax and SHALL produce output equivalent to the current hardcoded `renderStage1/2/3()` functions when interpolated.

#### Scenario: Default Stage 1 renders correctly
- **WHEN** `interpolate(DEFAULT_STAGE_1_HTML, vars)` is called with complete vars
- **THEN** the output matches the HTML that `renderStage1(vars)` previously returned

#### Scenario: Default strings seed the editor
- **WHEN** no custom template exists for a stage
- **WHEN** the GET route is called for that stage
- **THEN** the default template strings (subject, htmlBody, textBody) are returned as-is (with tokens unreplaced)

---

### Requirement: Simplified resolved variable set
Before interpolation the system SHALL resolve raw `TemplateVars` into a `ResolvedTemplateVars` map that handles all conditional logic. The resolved map SHALL include: `clientName`, `invoiceRef` (resolved from `invoiceNumber`), `amountDue`, `dueDate`, `paymentLink` (resolved to an HTML anchor or empty string), `yourName`, `daysOverdue` (empty string for Stage 1/2), `firmDeadline` (empty string for Stage 1/2).

#### Scenario: invoiceRef resolution with number
- **WHEN** `invoiceNumber` is "INV-042"
- **THEN** `invoiceRef` resolves to "Invoice INV-042"

#### Scenario: invoiceRef resolution without number
- **WHEN** `invoiceNumber` is absent or null
- **THEN** `invoiceRef` resolves to "your invoice"

#### Scenario: paymentLink resolution with URL
- **WHEN** `paymentUrl` is a valid URL
- **THEN** `paymentLink` resolves to `<a href="...">Pay invoice →</a>`

#### Scenario: paymentLink resolution without URL
- **WHEN** `paymentUrl` is absent
- **THEN** `paymentLink` resolves to an empty string

#### Scenario: Stage-scoped variables
- **WHEN** interpolating a Stage 1 or Stage 2 template
- **THEN** `daysOverdue` and `firmDeadline` resolve to empty strings

---

### Requirement: Custom template applied at send time
When the cron sends an email, the system SHALL check whether the user has a saved `EmailTemplate` for the current stage. If one exists, its `subject`, `htmlBody`, and `textBody` SHALL be used after interpolation. If none exists, the system SHALL use the default template strings.

#### Scenario: Custom template used when present
- **WHEN** the user has a saved template for Stage 2
- **WHEN** the cron processes a Stage 2 send for that user
- **THEN** the custom subject, htmlBody, and textBody are interpolated and sent

#### Scenario: Default used when no custom template
- **WHEN** the user has no saved template for Stage 1
- **WHEN** the cron processes a Stage 1 send for that user
- **THEN** the default Stage 1 template strings are interpolated and sent

---

### Requirement: Server-side HTML sanitisation
Before any `htmlBody` is passed to Resend, the system SHALL sanitise it using `sanitize-html`. The allowlist SHALL include standard block and inline HTML elements and `<a href target>`. The allowlist SHALL explicitly exclude `<script>`, `<style>`, `<iframe>`, event handler attributes (`on*`), and `javascript:` URLs.

#### Scenario: Script tags stripped
- **WHEN** the stored `htmlBody` contains a `<script>` tag
- **THEN** the tag and its contents are removed before the email is sent

#### Scenario: Safe formatting preserved
- **WHEN** the stored `htmlBody` contains `<strong>`, `<em>`, `<ul>`, `<li>`, and `<a href="https://...">` elements
- **THEN** all of those elements are preserved in the sanitised output

#### Scenario: Event handler attributes stripped
- **WHEN** the stored `htmlBody` contains `onclick` or other `on*` attributes
- **THEN** those attributes are removed before the email is sent

