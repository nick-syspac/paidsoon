# Design

## Context

See proposal.md for motivation. Current settings routes are already top-level (`/settings/*`) with grouped navigation metadata in `lib/settings/navigation.ts`, a settings shell in `app/settings/layout.tsx`, and many module-specific clients under `components/settings/*`. Save-state and error behavior is currently implemented per page client, and restricted access is enforced by a combination of visibility gating and server-side checks in settings routes/APIs.

Constraints:
- Keep existing canonical route namespace (`/settings/*`) and current business rules.
- Preserve module-specific validation and plan-entitlement behavior.
- Keep user identity and tenant isolation server authoritative.
- Improve navigation scale and discoverability without introducing duplicate settings surfaces.

## Goals / Non-Goals

**Goals:**
- Introduce a scalable settings IA model with sectioned navigation, collapse/expand semantics, and in-settings discovery/search.
- Standardize cross-page navigation safety for unsaved edits.
- Standardize save-failure recovery expectations so edits are not lost.
- Preserve helper-link continuity and current route behavior.
- Preserve mobile/tablet usability with accessible navigation interactions.

**Non-Goals:**
- No route-namespace migration away from `/settings/*`.
- No changes to subscription plan features, entitlement policy, or billing tier definitions.
- No new provider integrations or schema migrations solely for IA.
- No rewrite of individual module business logic beyond shared settings-shell interaction behaviors.

## Decisions

### 1) Keep route ownership stable and redesign IA via shared metadata
- Decision: Keep existing `/settings/*` pages and redesign settings IA using an expanded shared metadata model that drives sections, discoverability, and active-state behavior.
- Rationale: Preserves working route contracts while enabling scale as modules grow.
- Alternatives considered:
  - Per-page navigation logic: increases drift and duplicate behavior.
  - Route renaming or nested namespaces: high migration cost with little IA value.

### 2) Introduce a settings discovery layer tied to the same entitlement-filtered source of truth
- Decision: Implement search/filter from the same entitlement-aware navigation registry used for rendering groups.
- Rationale: Prevents discovery from exposing inaccessible or non-actionable settings.
- Alternatives considered:
  - Separate search index maintained per page: risk of stale or unauthorized entries.

### 3) Add shared unsaved-change guard contract for settings forms
- Decision: Define a reusable dirty-state/leave-confirmation contract that settings clients can opt into.
- Rationale: Current clients implement local save state independently; shared leave protection reduces accidental data loss and inconsistent behavior.
- Alternatives considered:
  - Leave each page implementation independent: keeps fragmentation and inconsistent protection.

### 4) Preserve draft values on failed saves across settings clients
- Decision: Explicitly require non-destructive error handling where failed saves do not clear edited inputs.
- Rationale: Users need to recover quickly from transient failures.
- Alternatives considered:
  - Full form reset on error: simpler but poor UX and higher retry friction.

### 5) Keep authorization server-authoritative for UI, URL, and API entry points
- Decision: Align navigation visibility, page access checks, and API access denial semantics as one contract.
- Rationale: Prevents bypass through direct URL/API access and keeps tenant boundaries consistent.
- Alternatives considered:
  - UI-only gating: insufficient for security and isolation.

## Risks / Trade-offs

- [Risk] A richer navigation metadata model can become hard to maintain across many modules.
  -> Mitigation: enforce single-source typed schema and add regression tests for required fields and ordering.

- [Risk] Unsaved-change prompts can become noisy for read-only interactions.
  -> Mitigation: dirty-state registration only for mutable forms and field-level change detection.

- [Risk] Discovery/search can degrade performance if computed from large client payloads.
  -> Mitigation: keep metadata lightweight, pre-filter by entitlement, and debounce client-side search.

- [Risk] Inconsistent adoption across module clients can leave partial UX behavior.
  -> Mitigation: prioritize high-traffic settings pages first, then complete rollout with coverage checks.

## Migration Plan

1. Expand settings navigation metadata contract to include section/discovery fields while keeping current hrefs.
2. Implement redesigned `SettingsNavigation` rendering with responsive section controls and discovery/search behavior.
3. Add reusable unsaved-change guard primitives and integrate into settings clients that persist editable forms.
4. Normalize failed-save handling in settings clients so draft values persist and retry remains available.
5. Verify helper-link/redirect continuity (`/settings`, `/settings/stripe`, `/settings/integrations`, `/settings/import`, `/settings/export`).
6. Add regression coverage for entitlement visibility, direct URL/API deny paths, responsive navigation behavior, and unsaved/failed-save interactions.

Rollback:
- Revert IA/navigation and guard contract changes while leaving existing `/settings/*` route tree intact.
- No data migration rollback required.

## Open Questions

None.
