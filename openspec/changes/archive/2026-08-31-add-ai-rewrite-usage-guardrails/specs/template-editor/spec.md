## ADDED Requirements

### Requirement: Display remaining AI rewrite credits in templates editor
The templates editor SHALL show the user's remaining monthly AI rewrite credits when AI rewrite is available for the active account.

#### Scenario: Remaining credits shown for eligible user
- **WHEN** an account with AI rewrite entitlement opens the templates editor
- **THEN** the interface shows the remaining monthly AI rewrite credits for that account

#### Scenario: No credit widget for ineligible user
- **WHEN** an account without AI rewrite entitlement opens the templates editor
- **THEN** no remaining-credit display is shown

### Requirement: Show usage-limit feedback in rewrite workflow
When AI rewrite is blocked by usage limits, the templates editor SHALL show a clear limit message and SHALL not replace editor content.

#### Scenario: Limit response preserves editor content
- **WHEN** the rewrite action receives a usage-limit error response
- **THEN** the current subject and body editor contents remain unchanged
- **THEN** the interface shows a limit message
