## ADDED Requirements

### Requirement: Reply-to entitlement starts at Solo
The system SHALL treat custom Reply-to as a Solo-and-above sender-identity capability. Starter SHALL NOT include the `custom_reply_to` entitlement.

#### Scenario: Feature check for Reply-to capability
- **WHEN** the system checks plan capability for `custom_reply_to`
- **THEN** it returns false for Starter and true for Solo, Small Business, and Accountant Partner

#### Scenario: Starter customer views sender-identity inclusions
- **WHEN** Starter plan sender-identity inclusions are presented on product surfaces
- **THEN** custom Reply-to is shown as unavailable on Starter
