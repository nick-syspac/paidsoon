## Purpose
Ensure marketing pages describe tier-gated features and billing capabilities using the actual plan catalog and implementation status, so prospects are never told a feature is available on a tier (or exists at all) when it isn't.

## ADDED Requirements

### Requirement: Tier-gated feature claims MUST name the tier that actually gates the feature
Marketing copy that attributes a feature to a specific subscription tier SHALL name a tier that currently exists in the plan catalog (`starter`, `solo`, `small_business`, or `accountant_partner`) and SHALL match the tier at which `lib/subscriptionPlans.ts` actually enables that feature.

#### Scenario: AI rewrite is attributed to the correct tier
- **WHEN** a marketing page describes AI-assisted reminder wording
- **THEN** it attributes the feature to Solo and above, not to a retired "Business" tier name

#### Scenario: Custom sender name and custom domain are described separately
- **WHEN** a marketing page describes custom "from" email capabilities
- **THEN** it distinguishes custom sender name (Solo and above) from a verified custom sending domain (Small Business and above) rather than presenting both as available on the same set of tiers

### Requirement: Marketing pages MUST NOT claim a customer-facing capability that has no implemented, customer-facing counterpart
Marketing copy SHALL NOT describe a capability as available to customers unless a customer-facing implementation of that capability exists.

#### Scenario: Audit trail claim matches actual scope
- **WHEN** a marketing page describes audit/activity logging
- **THEN** it does not claim a customer-facing audit trail UI or export exists unless one has shipped, and instead describes only the internal event logging that actually exists

### Requirement: Marketing claims about shipped billing capabilities MUST reflect current status
Marketing copy describing a billing or account capability SHALL NOT describe a capability as planned or future-only once it has shipped in the product.

#### Scenario: Free trial answer matches shipped trial
- **WHEN** a user reads the `/faq` answer to "Is there a free trial?"
- **THEN** the answer confirms the trial that is currently offered (duration and card requirement) rather than describing a trial as not yet offered

#### Scenario: Cancellation answer matches shipped cancellation flow
- **WHEN** a user reads the `/faq` answer to "Can I cancel at any time?"
- **THEN** the answer confirms cancellation/downgrade is available in account settings today, rather than describing it as pending "public billing" being enabled
