## Context

See proposal.md for motivation. The repository already contains a persisted `CostGuardSetting` model and a read-only settings page. The missing implementation is the write path: a user-safe update flow that persists the values already defined in the schema without creating a separate or parallel config system.

## Goals / Non-Goals

**Goals:**
- Add a safe, authenticated update flow for Cost Guard settings
- Keep the existing configuration values aligned with the current `CostGuardSetting` model
- Preserve the current default behavior when no override exists
- Keep updates tenant-scoped and RLS-safe

**Non-Goals:**
- Changing the underlying Cost Guard detection algorithm itself
- Adding arbitrary advanced tuning beyond the existing fields
- Allowing cross-user editing or bypassing the per-user context

## Decisions

### D1 — Use the existing `CostGuardSetting` row as the single source of truth
The data model already represents the configuration as a single user-scoped row. The design keeps that row as the authoritative record and uses `upsert` for first-time creation and later updates.

Alternative considered: creating a new settings table or additional config records. Rejected because it duplicates the existing schema and increases complexity without adding value.

### D2 — Validate at the API boundary with Zod
The settings route will validate `materialityPercent`, `materialityCents`, `defaultLookbackDays`, and `alertDigestMode` before any database write. This prevents malformed data, keeps UI and API consistent, and follows the repo’s existing server-side validation pattern.

Alternative considered: trusting the client payload. Rejected because it allows invalid values and inconsistent triggers that would silently degrade alert quality.

### D3 — Keep writes inside the authenticated user context
All writes will flow through `withUserContext(user.id, ...)` so the app keeps the tenant-scoped RLS context active. This mirrors existing authenticated settings patterns and avoids accidental cross-account access.

Alternative considered: using admin context or a service-level write path. Rejected because it weakens the security model that the project already enforces.

### D4 — Convert the page into a form while preserving defaults
The UI will render the current values as editable controls with save behavior and fallback to defaults when a row does not exist yet. This keeps the experience simple while preserving the repo’s existing design language and default-safe setup.

Alternative considered: adding a separate advanced settings page. Rejected because the current settings page already owns this capability and the user journey is clearer in one place.

## Risks / Trade-offs

- [Invalid config values] → Mitigation: strict Zod validation at the settings API boundary with allowed ranges and mode checks.
- [No row exists yet for a user] → Mitigation: `upsert` so the first save creates the configuration row automatically.
- [Stale UI after save] → Mitigation: refresh the form state after a successful save and show clear success/error feedback.
- [User confusion about what each threshold means] → Mitigation: keep the labels and helper text consistent with the existing card copy and business-friendly language.

## Migration Plan

No schema migration is required for this change because the required storage model already exists. The implementation work is limited to:

1. Add the authenticated settings API route for update validation and persistence.
2. Replace the read-only settings page with a form that reads the current row and submits changes.
3. Verify the route preserves RLS and that the default values remain available for users without saved overrides.
4. Validate the settings contract with focused tests for valid and invalid payloads.

## Open Questions

- None at the design level. The data model, current page, and security patterns are already sufficient to proceed without additional blocking decisions.
