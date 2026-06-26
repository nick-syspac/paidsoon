## Why

During sign-in and sign-up, the submit button shows only a text change ("Signing in...") while authentication is in progress. Users have no strong visual cue that the system is working, which can lead to confusion or repeated clicks. A spinner gives immediate, unambiguous feedback that a network request is in flight.

## What Changes

- Replace the plain text loading state on the Sign In submit button with a spinning circle icon + label.
- Replace the plain text loading state on the Sign Up submit button with a spinning circle icon + label.
- Add a reusable `Spinner` component (or inline SVG) so both pages share the same visual treatment.
- Disable the button while loading (already done) and keep the disabled/opacity styling.

## Capabilities

### New Capabilities

- `auth-loading-spinner`: A visible animated spinner shown inside the submit button on the sign-in and sign-up forms while authentication is in progress.

### Modified Capabilities

<!-- No existing spec-level requirements are changing. -->

## Impact

- `app/(auth)/sign-in/page.tsx` — button loading state updated.
- `app/(auth)/sign-up/page.tsx` — button loading state updated.
- Possibly `components/ui/Spinner.tsx` (new shared component).
- No API, database, or backend changes required.
