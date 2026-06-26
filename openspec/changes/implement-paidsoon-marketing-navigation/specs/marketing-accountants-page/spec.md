## ADDED Requirements

### Requirement: Accountants page SHALL address bookkeeper and accountant use cases
The `/accountants` page SHALL contain sections targeting bookkeepers and accountants with content covering: managing multiple clients, client debtor visibility, client onboarding workflow, and a partner/referral programme.

#### Scenario: Accountant-targeted content is present
- **WHEN** a visitor loads `/accountants`
- **THEN** content relating to multi-client management, debtor visibility, and client onboarding is visible

### Requirement: Accountants page SHALL include a partner CTA
The `/accountants` page SHALL include a primary call-to-action for accountants to enquire about a partnership, routing to `/contact?type=partnership` or `/contact`.

#### Scenario: Partner CTA is present
- **WHEN** a visitor views `/accountants`
- **THEN** at least one CTA for partnership enquiry is visible

### Requirement: Accountants page SHALL have unique page metadata
The `/accountants` page SHALL export `generateMetadata` returning a unique `title` and `description`.

#### Scenario: Metadata is set
- **WHEN** the accountants page is rendered server-side
- **THEN** the `<title>` tag contains a unique accountant-focused title
