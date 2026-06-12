## Why

The project needs a safe pre-launch mode where public authentication flows are unavailable while the site is not yet live. A single environment-controlled switch allows controlled rollout without code changes between environments.

## What Changes

- Introduce a new environment variable `LIVE` that controls launch mode.
- When `LIVE=false`, disable sign-in and sign-up experiences and prevent access to those auth routes.
- When `LIVE=false`, show a top-of-page banner indicating the site is not live.
- When `LIVE=true`, preserve current behavior with no auth gating/banner restrictions.
- Define consistent parsing/default behavior for missing or malformed `LIVE` values.

## Capabilities

### New Capabilities
- `live-mode-auth-gating`: Environment-driven launch mode that gates auth entry points and displays a global not-live banner.

### Modified Capabilities
- None.

## Impact

- Affected code:
  - Auth-facing pages and/or route handlers under `app/(auth)/sign-in` and `app/(auth)/sign-up`
  - Shared layout/UI where a global top banner can be rendered
  - Environment/config utility logic for `LIVE` parsing
  - Potential middleware checks for auth route access gating
- APIs: No external API contract changes.
- Dependencies: No new external dependencies expected.
- Systems: Environment configuration across local/dev/staging/production must include `LIVE`.
