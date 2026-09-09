## Why

PaidSoon has a working help center, but it does not yet provide a complete, end-to-end user guide that walks a new customer from setup through daily operations and common troubleshooting. A structured guide is needed now to reduce onboarding friction, support load, and confusion around which capabilities are currently available versus planned.

## What Changes

- Define and publish a comprehensive user guide information architecture under the existing help center.
- Add a curated set of user guide articles in `content/help/` covering onboarding, billing, invoice workflows, integrations, and account/settings operations.
- Establish a user-guide coverage map and verification workflow so every article is tied to shipped behavior and receives periodic freshness checks.
- Add acceptance criteria for consistency (template conformance, navigation discoverability, and searchable coverage) across all user guide pages.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `help-center`: Expand requirements from generic tutorial support to a complete, structured PaidSoon user guide with coverage, verification, and discoverability standards.

## Impact

- Affected docs/content: `content/help/**` and help center navigation/search metadata.
- Affected specs: modified delta for `help-center` requirements.
- Affected user experience: `/help` becomes the authoritative user guide for onboarding, feature usage, and troubleshooting.
- No new external dependencies or runtime service integrations are expected.
