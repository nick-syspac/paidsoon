# deposit-guard-foundation Specification

## Purpose
Define the tenant-safe DepositGuard MVP lifecycle so businesses can create jobs, request deposits, record payments, and block commencement until required funds are confirmed.
## Requirements
### Requirement: DepositGuard SHALL provide a tenant-isolated job and request lifecycle
The system SHALL let an authenticated tenant user create and manage DepositGuard jobs and deposit requests without exposing data across tenants.

#### Scenario: User creates a manual deposit-backed job
- **WHEN** an authenticated user submits a valid manual job, customer selection, quote reference, and deposit configuration
- **THEN** the system creates the job and initial deposit request in the same tenant scope
- **AND** the created records are visible only to that tenant

#### Scenario: Cross-tenant job access is attempted
- **WHEN** a user requests a DepositGuard job or request that belongs to another tenant
- **THEN** the system denies access and does not reveal whether the record exists

### Requirement: DepositGuard SHALL calculate authoritative money amounts server-side
The system SHALL calculate required deposit, outstanding balance, and related totals on the server using decimal-safe arithmetic and MUST reject invalid combinations.

#### Scenario: Percentage deposit calculation succeeds
- **WHEN** a job total and percentage deposit are provided with valid tax handling
- **THEN** the system stores a required deposit amount equal to the rounded percentage of the authoritative total
- **AND** outstanding balance equals total minus confirmed paid amount

#### Scenario: Required deposit exceeds job total
- **WHEN** submitted deposit configuration would produce a required deposit larger than the job total
- **THEN** the system rejects the request with a validation error

### Requirement: Commencement SHALL remain blocked until required deposit is confirmed
The system SHALL set commencement protection to blocked while confirmed paid amount is below required deposit and SHALL automatically unblock only after sufficient cleared payment is recorded.

#### Scenario: Job starts in blocked state
- **WHEN** a job requires a deposit and no cleared payment has been recorded
- **THEN** commencement is blocked and work status remains not ready to start

#### Scenario: Deposit is fully confirmed
- **WHEN** confirmed paid amount reaches or exceeds required deposit
- **THEN** commencement blocking is removed
- **AND** work status transitions to ready-to-start
- **AND** an audit event is recorded for the unblock action

### Requirement: DepositGuard actions SHALL be entitlement-gated and auditable
The system SHALL enforce DepositGuard feature access and operation limits on the server, and all financially material actions SHALL emit audit events.

#### Scenario: Ineligible tier attempts operational action
- **WHEN** a user without DepositGuard operational entitlement submits create/send/record-payment actions
- **THEN** the system returns a deterministic upgrade-required response

#### Scenario: Material financial action succeeds
- **WHEN** a user creates a request, records payment, cancels a request, or completes a job
- **THEN** the system stores an audit event that includes actor, tenant, action, target, and timestamp

