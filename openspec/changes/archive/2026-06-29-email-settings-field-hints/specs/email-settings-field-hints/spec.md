## ADDED Requirements

### Requirement: From email field has inline hint text
The Email Settings form SHALL display a hint below the From email input explaining that users should use a dedicated catch address on a domain they control, and that a verification link will be sent on save.

#### Scenario: Hint is visible on the From email field
- **WHEN** a Solo+ user views the Email Settings form
- **THEN** a hint reading "Use a dedicated address like collections@yourcompany.com. We'll send a verification link when you save." SHALL appear below the From email input

### Requirement: From name field has inline hint text
The Email Settings form SHALL display a hint below the From name input nudging users to enter their business or trading name.

#### Scenario: Hint is visible on the From name field
- **WHEN** a Solo+ user views the Email Settings form
- **THEN** a hint reading "Your business name as it appears to clients — e.g. "Acme Ltd" or "Acme Consulting"." SHALL appear below the From name input

### Requirement: Reply-to field has inline hint text
The Email Settings form SHALL display a hint below the Reply-to input explaining that client replies are directed to this address instead of the From address.

#### Scenario: Hint is visible on the Reply-to field
- **WHEN** a Solo+ user views the Email Settings form
- **THEN** a hint reading "Optional. Client replies land here instead of your From address." SHALL appear below the Reply-to input

### Requirement: Form intro paragraph does not duplicate field-level verification copy
The form-level intro paragraph SHALL NOT contain the sentence "You'll need to verify the email before it's used." as this is now covered by the From email field hint.

#### Scenario: Intro paragraph is trimmed
- **WHEN** a Solo+ user views the Email Settings form
- **THEN** the intro paragraph SHALL read "Set a custom from-address." without the verification sentence
- **THEN** the pending/verified status spans SHALL still be displayed when applicable
