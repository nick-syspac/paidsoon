## Why

PaidSoon currently presents MYOB Business as early access and Xero as planned in the integrations experience, which understates the current readiness of these integrations. Updating both to available aligns product messaging with current capability and reduces user confusion during onboarding and evaluation.

## What Changes

- Update integration availability states so MYOB Business is shown as available.
- Update integration availability states so Xero is shown as available.
- Update corresponding status badges and supporting copy so both integrations are communicated as production-ready options.

## Capabilities

### New Capabilities
- `integration-availability-signaling`: Defines how the integrations UI communicates availability status and descriptive copy for supported accounting providers.

### Modified Capabilities
- None.

## Impact

- Affected code: integrations listing/presentation logic and related UI copy in onboarding or settings surfaces where integration cards are rendered.
- APIs: no new API routes and no API contract changes expected.
- Dependencies: no new runtime dependencies expected.
- Systems: product messaging and user-facing integration discovery experience.