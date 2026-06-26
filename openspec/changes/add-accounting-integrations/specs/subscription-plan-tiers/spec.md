## ADDED Requirements

### Requirement: Accounting integrations are gated to Solo and above
The system SHALL restrict access to accounting provider connections (Xero, MYOB) to users
on the Solo or Small Business subscription tier. Users on the Starter tier SHALL see an
upgrade prompt when they attempt to initiate an accounting connection and SHALL NOT be able
to start an OAuth flow.

#### Scenario: Starter user attempts to connect an accounting provider
- **WHEN** a user on the Starter tier navigates to the integrations settings page and clicks any "Connect" button for an accounting provider
- **THEN** the system displays a plan upgrade prompt explaining that accounting integrations require Solo or higher, and does NOT initiate an OAuth redirect

#### Scenario: Solo user connects Xero
- **WHEN** a user on the Solo tier clicks "Connect Xero"
- **THEN** the system initiates the OAuth flow without presenting an upgrade prompt

#### Scenario: Small Business user connects MYOB
- **WHEN** a user on the Small Business tier clicks "Connect MYOB"
- **THEN** the system initiates the OAuth flow without presenting an upgrade prompt

#### Scenario: Feature check via hasPlanFeature
- **WHEN** `hasPlanFeature(tier, 'accountingIntegrations')` is called
- **THEN** it returns `true` for `'solo'` and `'small_business'` tiers and `false` for `'starter'` and legacy `'free'`
