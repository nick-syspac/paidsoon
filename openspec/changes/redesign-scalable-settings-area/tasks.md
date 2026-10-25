# Tasks

## 1. Expand settings IA metadata and navigation rendering

- [x] 1.1 Extend settings navigation metadata in `lib/settings/navigation.ts` with section/discovery fields (collapse/search labels, ordering, aliases where needed) and verify existing `/settings/*` links still resolve from the generated groups.
- [x] 1.2 Redesign `components/settings/SettingsNavigation.tsx` to support section collapse/expand and active-state restoration, and verify module + setting context stays correct when navigating between multiple settings pages.
- [x] 1.3 Add in-settings search/filter behavior backed by entitlement-filtered metadata and verify a result inside a collapsed section opens the right settings route with section context revealed.
- [x] 1.4 Add/adjust navigation unit coverage to verify ordering, active-match behavior, and entitlement-filtered discoverability from shared metadata.

## 2. Standardize settings form navigation safety and failure recovery

- [x] 2.1 Introduce shared dirty-state + leave-confirmation behavior for settings forms and verify route transitions, browser back/forward, and direct settings-link clicks warn when unsaved edits exist.
- [x] 2.2 Integrate the unsaved-change guard into core editable settings clients (at minimum account, schedule, email, templates, and one module settings form) and verify leaving can be canceled without losing draft inputs.
- [x] 2.3 Normalize failed-save handling in participating settings clients so failed API responses keep edited values visible and retryable, and verify with client tests that values are not reset on error.
- [x] 2.4 Add or update tests covering unsaved-leave interception and failed-save value retention for representative settings pages.

## 3. Preserve authorization, deep-link continuity, and responsive usability

- [x] 3.1 Verify helper-link continuity for `/settings`, `/settings/stripe`, `/settings/integrations`, `/settings/import`, and `/settings/export`, including query/anchor preservation where applicable.
- [x] 3.2 Align UI visibility with server-authoritative route/API restrictions for gated settings, and verify direct URL and direct API access return existing deny outcomes for non-entitled users.
- [x] 3.3 Validate tenant/business-context isolation of settings visibility, reads, and writes (for any active business-switch context), and verify context reuse does not leak cross-context settings state.
- [x] 3.4 Validate responsive and accessibility behavior (mobile/tablet nav operation, keyboard reachability, focus visibility, no traps) and verify with targeted UI tests and manual smoke checks.

## 4. Integration verification and documentation updates

- [x] 4.1 Run `npm run lint` and `npm run test`, and verify all settings-navigation and settings-client regressions pass with the redesigned IA behaviors.
- [x] 4.2 Update route/navigation documentation in `docs/DDD.md` if behavior or IA contracts changed materially, and verify docs reflect shipped `/settings/*` behavior without describing unimplemented features.
