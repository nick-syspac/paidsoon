## Why

The Email Settings form fields (From email, From name, Reply-to) have no contextual guidance, leaving users uncertain what values are expected or why. This causes mis-configuration — users enter personal Gmail addresses that fail Resend domain verification, or put their personal name instead of a business name.

## What Changes

- Add inline hint text below the **From email** input explaining it should be a dedicated catch address (e.g. `collections@yourcompany.com`) and that domain verification will follow
- Add inline hint text below the **From name** input nudging users toward their business/trading name
- Add inline hint text below the **Reply-to** input clarifying where client replies land
- Trim the redundant verification note from the form-level intro paragraph (moved to field level)

## Capabilities

### New Capabilities

- `email-settings-field-hints`: Inline contextual hint text beneath each custom email settings form field

### Modified Capabilities

<!-- No requirement-level changes to existing specs -->

## Impact

- `components/settings/EmailSettingsClient.tsx` — UI only, no API or data model changes
- No new dependencies
- No breaking changes
