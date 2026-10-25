# Proposal

## Why

PaidSoon settings now spans many modules and route surfaces, and the current left-rail grouping will become harder to navigate as more module settings ship. The product needs a scalable information architecture that improves findability, preserves existing behavior, and keeps authorization boundaries intact across UI and direct URL/API access.

## What Changes

- Redesign the Settings information architecture around scalable module sections, while keeping canonical settings routes and existing business logic unchanged.
- Add a section-and-item discovery model for Settings that supports collapsed module sections, in-page search/filtering, and reliable active-state restoration.
- Define cross-page unsaved-change behavior so users are warned before leaving edited settings forms.
- Standardize failed-save behavior so edited values remain visible and recoverable after API errors.
- Preserve and verify existing deep links and helper redirects (`/settings`, `/settings/stripe`, `/settings/integrations`, `/settings/import`, `/settings/export`) after the IA redesign.
- Require server-authoritative access outcomes for restricted settings pages and backing APIs, including tenant/business-context isolation where context switching is available.
- Preserve mobile and tablet navigation usability with an accessible responsive interaction model.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `settings-module-navigation`: Expand settings IA requirements to cover scalable sectioning, discovery/search, unsaved-change navigation safety, failure-state resilience, deep-link continuity, responsive behavior, and server-authoritative restriction handling.

## Impact

- Affected code:
  - `app/settings/layout.tsx`, `app/settings/page.tsx`, and `app/settings/**/page.tsx` (layout, route framing, and deep-link continuity).
  - `components/settings/SettingsNavigation.tsx` and related settings clients that maintain local save state.
  - `lib/settings/navigation.ts` and related settings route constants/helpers.
  - Restricted settings APIs under `app/api/settings/**` where UI visibility and direct API access must stay aligned.
- APIs and integration behavior:
  - No new external provider integrations.
  - Existing settings API contracts remain, but access/deny outcomes and error-state behavior are made explicit and consistent.
- Backward compatibility:
  - Canonical top-level `/settings/*` routes stay unchanged.
  - Existing helper links and redirects remain functional after redesign.
- Security and tenant isolation:
  - User identity remains server-derived.
  - Access control remains server authoritative for page load and API calls.
  - Settings state and writes stay isolated to the active authenticated tenant/business context.
- Risks:
  - Over-abstracting nav groups could hide critical settings if registry metadata is incomplete.
  - Unsaved-change interception can degrade UX if applied to non-editing flows.
  - Search/filter behavior can desynchronize from entitlement-gated visibility unless driven by the same source of truth.
