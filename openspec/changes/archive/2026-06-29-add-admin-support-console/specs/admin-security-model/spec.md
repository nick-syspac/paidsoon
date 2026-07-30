## ADDED Requirements

### Requirement: Admin console access is strongly protected
The system MUST keep the admin console in a separate admin route area, require MFA or passkey-style strong authentication where supported, enforce role-based permissions, apply least privilege, support device trust or machine-bound access where possible, support optional IP allowlist or VPN protection, apply an admin session timeout, require re-authentication for sensitive actions, require a reason for risky actions, maintain a full audit trail, and prevent access to raw secrets, plain-text OAuth tokens, and unrestricted database editing.

#### Scenario: Non-admin user cannot access the console
- **WHEN** a non-admin user navigates to admin routes
- **THEN** access is denied before support data is shown

#### Scenario: Sensitive action requires re-authentication
- **WHEN** an admin attempts a risky billing or ownership action after session aging
- **THEN** the system requires re-authentication before continuing

### Requirement: Admin roles are explicit and least privilege
The system MUST distinguish at least the following roles: Support Viewer, Support Operator, Billing Admin, Integration Admin, Platform Admin, and Super Admin / Break Glass. The implementation MUST define what each role can and cannot do.

#### Scenario: Support Viewer is read-only
- **WHEN** a Support Viewer uses the admin console
- **THEN** they can inspect state but cannot execute corrective mutations

#### Scenario: Break-glass access is exceptional
- **WHEN** the break-glass role is used
- **THEN** the action is treated as exceptional and fully audited
