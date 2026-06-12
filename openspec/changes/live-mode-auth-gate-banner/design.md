## Context

The application currently exposes sign-in and sign-up flows as part of normal operation. The requested change introduces a launch-state switch so teams can deploy and preview the site before go-live without allowing end-user authentication entry points.

The switch is a new environment variable, `LIVE`, with two intended states:
- `LIVE=true`: production/live behavior (current behavior)
- `LIVE=false`: pre-launch behavior (auth disabled + visible not-live banner)

This must behave consistently across server-rendered routes, route protection, and UI composition.

## Goals / Non-Goals

**Goals:**
- Define a single source of truth for launch mode based on `LIVE`.
- Prevent access to sign-in and sign-up when launch mode is not live.
- Render a prominent top banner when launch mode is not live.
- Keep existing behavior unchanged when launch mode is live.
- Ensure deterministic fallback behavior when `LIVE` is missing or malformed.

**Non-Goals:**
- Redesign authentication UX beyond disabled-state behavior.
- Introduce role-based exceptions or admin bypass rules in this change.
- Add feature-flag infrastructure beyond the `LIVE` environment gate.

## Decisions

1. Centralized launch-mode parser
- Decision: Add a shared utility that parses `process.env.LIVE` once and exposes a boolean `isLiveMode`.
- Rationale: Prevents inconsistent string checks scattered across pages/middleware.
- Alternative considered: Inline checks (`process.env.LIVE === "true"`) in each route/component. Rejected due to duplication and drift risk.

2. Fail-safe default to not-live when invalid/missing
- Decision: Treat missing/malformed `LIVE` as `false`.
- Rationale: Safer operational default before launch; avoids accidentally exposing auth flows.
- Alternative considered: Default to `true`. Rejected due to higher risk of unintended public access.

3. Route-level auth gating plus UI-level affordance
- Decision: Enforce auth route blocking at route/middleware level and also surface clear UI messaging with a top banner.
- Rationale: Routing enforcement guarantees behavior; banner explains state to users.
- Alternative considered: Banner-only approach. Rejected because direct route access could still bypass UX intent.

4. Banner rendered from shared layout boundary
- Decision: Render the not-live banner in a shared top layout so it appears consistently without page-by-page duplication.
- Rationale: Lower maintenance and guaranteed coverage for app surfaces.
- Alternative considered: Per-page banners. Rejected due to inconsistency risk.

## Risks / Trade-offs

- [Over-blocking routes] -> Ensure gating targets only sign-in/sign-up surfaces and preserves unrelated pages.
- [Environment drift across deployments] -> Document `LIVE` in runbooks and environment templates.
- [Confusing user experience if banner appears unexpectedly] -> Use clear banner copy and only show when `isLiveMode` is false.
- [Regression in auth navigation links] -> Validate links/buttons gracefully handle disabled state.

## Migration Plan

1. Add `LIVE` to environment configuration for local/dev/staging/prod.
2. Deploy with `LIVE=false` to verify pre-launch mode (banner shown, auth gated).
3. Run route and UI checks for sign-in/sign-up blocking behavior.
4. Set `LIVE=true` at go-live and verify normal auth flows resume.
5. Rollback strategy: set `LIVE=false` to immediately re-enter gated pre-launch mode if needed.

## Open Questions

- Should auth routes return redirect, 404, or dedicated unavailable message in pre-launch mode?
- Should the not-live banner appear globally or only on public/auth-adjacent pages?
- Is there a requirement for internal/staff bypass during pre-launch?
