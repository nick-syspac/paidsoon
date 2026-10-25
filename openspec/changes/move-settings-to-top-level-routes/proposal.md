# Proposal

## Why

Settings currently live under `/dashboard/settings/*`, so the dashboard shell and the settings shell render together and create competing navigation contexts. Moving settings to top-level `/settings/*` creates a single-purpose settings workspace, simplifies navigation semantics, and aligns URL structure with product intent.

## What Changes

- **BREAKING**: Move canonical settings routes from `/dashboard/settings/*` to `/settings/*`.
- Move settings pages and layout into a real top-level settings route tree so settings pages no longer render inside the dashboard left-rail shell.
- Update all internal links, redirects, CTA destinations, and API callback return destinations that currently point to `/dashboard/settings/*`.
- Keep legacy settings helper routes (`/settings/stripe`, `/settings/integrations`) as internal redirects to `/settings/connections` for consistency within the new namespace.
- Remove reliance on `/dashboard/settings/*` paths (no backward-compatibility redirects requested).

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `settings-module-navigation`: Canonical settings destinations move to `/settings/*`, while grouped navigation, active-state behavior, and entitlement gating remain unchanged.
- `accounting-integrations`: Canonical connections destination and callback landing paths move from `/dashboard/settings/connections` to `/settings/connections`, including legacy-in-namespace redirect behavior.
- `user-profile-display-name`: Account settings route context changes from `/dashboard/settings/account` to `/settings/account`.

## Impact

- Affected code:
  - App routes under `app/dashboard/settings/*` (moved/re-homed to `app/settings/*`).
  - Settings navigation metadata in `lib/settings/navigation.ts`.
  - Dashboard/user-menu/top-nav links that target settings.
  - Billing/access gating destination constants and checks that use settings URLs.
  - OAuth and integration callback route handlers that redirect back to settings.
- API and integrations:
  - No payload contract changes; redirect targets after callback/upgrade/error are updated to `/settings/*`.
- Backward compatibility:
  - Intentional hard cutover: `/dashboard/settings/*` is no longer supported.
- Security and tenant isolation:
  - No change to auth model, RLS behavior, or tenant boundaries; all existing auth checks remain required in new route locations.
- Risks:
  - Missed path rewrites could break post-auth/provider callback flows or subscription upgrade paths.
  - User bookmarks and old deep links to `/dashboard/settings/*` will fail by design.
