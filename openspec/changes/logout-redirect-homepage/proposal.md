## Why

Users currently land on the sign-in page after logout, which leaves them in an authentication flow. Redirecting to the main homepage provides better UX and a clear entry point back into the app or landing page.

## What Changes

- The logout endpoint (`/auth/sign-out/route.ts`) will redirect to the main homepage (`/`) instead of the default Supabase auth behavior.
- Users who click the logout button will land on the PaidSoon homepage rather than the login page.

## Capabilities

### New Capabilities

- `logout-redirect-home`: After user logs out, they are redirected to the main homepage instead of the authentication flow.

### Modified Capabilities

<!-- Existing capabilities whose REQUIREMENTS are changing (not just implementation).
     Only list here if spec-level behavior changes. Each needs a delta spec file.
     Use existing spec names from openspec/specs/. Leave empty if no requirement changes. -->

## Impact

- **Files**: `app/auth/sign-out/route.ts` — the logout handler
- **User experience**: Changed landing page after logout (from login → homepage)
- **Auth flow**: Logout endpoint behavior modified
