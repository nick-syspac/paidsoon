## ADDED Requirements

### Requirement: EmailTemplate database model
The system SHALL store custom email templates in an `email_templates` table. Each record SHALL be scoped to a user and a stage (1, 2, or 3). The combination of `userId` and `stage` SHALL be unique. Records SHALL store `subject` (string), `htmlBody` (string), and `textBody` (string).

#### Scenario: Unique constraint per user per stage
- **WHEN** a user saves a template for Stage 1
- **THEN** a record is created with `userId` and `stage = 1`
- **WHEN** the user saves Stage 1 again
- **THEN** the existing record is updated (upsert), not duplicated

---

### Requirement: Row-level security on email_templates
The `email_templates` table SHALL have RLS policies enforced via `withUserContext`. Users SHALL only be able to read, insert, or update their own records. No user SHALL be able to read another user's custom templates.

#### Scenario: User reads own templates
- **WHEN** a user requests their templates via `withUserContext`
- **THEN** only records where `userId = auth.uid()` are returned

#### Scenario: Cross-user isolation
- **WHEN** a request is made with one user's context
- **THEN** no records belonging to another user are accessible

---

### Requirement: GET /api/settings/templates
The route SHALL accept an optional `stage` query parameter (1, 2, or 3). It SHALL return: the user's saved custom template for that stage if one exists, otherwise the system default template strings for that stage. It SHALL also return `canCustomize` and `tier`. If `stage` is omitted it SHALL return stage 1 by default.

#### Scenario: Returns custom template if saved
- **WHEN** the user has a saved template for stage 2
- **WHEN** GET is called with `?stage=2`
- **THEN** the response contains the user's saved `subject`, `htmlBody`, and `textBody`

#### Scenario: Returns default if no custom template
- **WHEN** the user has no saved template for stage 1
- **WHEN** GET is called with `?stage=1`
- **THEN** the response contains the system default subject, HTML body, and plain text body for stage 1

#### Scenario: Unauthorised access rejected
- **WHEN** the request has no valid session
- **THEN** the route returns 401

---

### Requirement: PUT /api/settings/templates
The route SHALL accept `stage` (1 | 2 | 3), `subject` (string, min 3, max 150 chars), `htmlBody` (string, min 10, max 50 000 chars), and `textBody` (string, min 10, max 10 000 chars). It SHALL upsert the `EmailTemplate` record for the authenticated user and the given stage. It SHALL require the `custom_reminder_templates` feature flag.

#### Scenario: Successful upsert
- **WHEN** a Small Business user submits valid stage, subject, htmlBody, and textBody
- **THEN** the record is created or updated and the route returns 200 with the saved template

#### Scenario: Feature gate enforced
- **WHEN** a user below Small Business tier submits a PUT request
- **THEN** the route returns 403

#### Scenario: Validation enforced
- **WHEN** the subject is fewer than 3 characters
- **THEN** the route returns 422 with a validation error

---

### Requirement: DELETE /api/settings/templates (reset)
The route SHALL accept a `stage` query parameter and SHALL delete the `EmailTemplate` record for the authenticated user and that stage, if one exists. If no record exists the route SHALL return 200 (idempotent).

#### Scenario: Reset existing custom template
- **WHEN** the user has a saved template for stage 3
- **WHEN** DELETE is called with `?stage=3`
- **THEN** the record is deleted and the route returns 200

#### Scenario: Reset with no existing template is idempotent
- **WHEN** no custom template exists for the requested stage
- **WHEN** DELETE is called
- **THEN** the route returns 200 without error
