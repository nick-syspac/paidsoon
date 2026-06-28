## ADDED Requirements

### Requirement: User support search and membership inspection are available
The system MUST allow admins to search users by name and email and view each user’s tenant memberships, roles, authentication provider, and last login.

#### Scenario: Search by email returns the correct user
- **WHEN** an admin searches by a user email address
- **THEN** matching user records are returned

#### Scenario: Memberships are visible
- **WHEN** an admin opens a user support record
- **THEN** the user’s tenant memberships and roles are shown

### Requirement: User recovery actions support common login problems
The system MUST allow admins to resend invites, expire and regenerate invites, send password reset or magic login links, remove a user from a tenant, transfer tenant ownership, disable a user account, unlock a locked account, and inspect the last login.

#### Scenario: Invite resend is available
- **WHEN** a tenant invite is stuck or expired
- **THEN** an admin can resend or regenerate the invite

#### Scenario: Locked account can be unlocked
- **WHEN** a user account is locked
- **THEN** an admin can unlock it with audit logging

### Requirement: Support-session or impersonation, if present, is constrained
If impersonation or support-session functionality is available, the system MUST require admin re-authentication, require a reason, be time-limited, show a visible support-session banner, prevent access to secrets or payment-sensitive data, and log every action to the audit log.

#### Scenario: Support session is visible
- **WHEN** an admin is acting in support-session mode
- **THEN** a visible banner identifies the active support context

#### Scenario: Sensitive data remains blocked
- **WHEN** an admin uses impersonation mode
- **THEN** the UI still blocks secrets and payment-sensitive details
