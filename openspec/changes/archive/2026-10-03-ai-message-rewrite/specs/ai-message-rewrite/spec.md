## ADDED Requirements

### Requirement: Generate three tone variants from a draft message
The system SHALL accept a draft invoice follow-up message from an authenticated Small Business user and return three professionally rewritten variants — Friendly, Firm, and Final Notice — each with a subject line and message body. The rewrite SHALL be performed by GPT-4o-mini via the Vercel AI SDK using structured output mode.

#### Scenario: Successful rewrite for eligible user
- **WHEN** a Small Business user submits a draft message of 10–5000 characters to `POST /api/settings/ai`
- **THEN** the system returns HTTP 200 with `{ friendly, firm, final_notice }` each containing `{ subject, message }`

#### Scenario: Unauthenticated request rejected
- **WHEN** a request is made to `POST /api/settings/ai` without a valid session
- **THEN** the system returns HTTP 401

#### Scenario: Ineligible tier rejected
- **WHEN** a Starter or Solo user submits a draft message to `POST /api/settings/ai`
- **THEN** the system returns HTTP 403 with an error indicating the Small Business plan is required

#### Scenario: Input too short rejected
- **WHEN** the submitted text is fewer than 10 characters
- **THEN** the system returns HTTP 422 with a validation error

#### Scenario: Input too long rejected
- **WHEN** the submitted text exceeds 5000 characters
- **THEN** the system returns HTTP 422 with a validation error

### Requirement: Display all three rewrite variants simultaneously
The UI SHALL display all three rewritten variants (Friendly, Firm, Final Notice) side by side after a successful rewrite call. Each variant panel SHALL show the subject line and message body. No tone selector dropdown SHALL be present before the call — the user selects the variant they want after seeing all three.

#### Scenario: All three panels render on success
- **WHEN** a rewrite call completes successfully
- **THEN** three panels are shown: Friendly, Firm, and Final Notice, each containing the subject and message from the API response

#### Scenario: Loading state shown during call
- **WHEN** the user clicks the Rewrite button and the API call is in progress
- **THEN** the button is disabled and a loading indicator is shown

#### Scenario: Error state shown on failure
- **WHEN** the API returns an error response
- **THEN** an error message is displayed and no variant panels are shown

### Requirement: Copy button per variant
Each variant panel SHALL include a button that copies the message body to the clipboard.

#### Scenario: Copy button copies message text
- **WHEN** the user clicks the Copy button on a variant panel
- **THEN** the message body text is written to the system clipboard

### Requirement: Preserve facts in rewrites
The system prompt SHALL instruct the model to preserve all invoice details, dates, amounts, names, and payment references unchanged. The model SHALL NOT invent legal threats, debt collection actions, or penalty clauses unless they appear in the original text.

#### Scenario: Invoice details preserved
- **WHEN** the original text contains a specific invoice number, amount, or due date
- **THEN** the same details appear unchanged in all three rewritten variants

### Requirement: Australian English
The system prompt SHALL instruct the model to use Australian English spelling and tone.

#### Scenario: Australian spelling used
- **WHEN** any rewritten variant is returned
- **THEN** the text uses Australian English spelling conventions (e.g. "apologise" not "apologize")
