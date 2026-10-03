## Context

The current settings UI is defined by the flat `TABS` array in `app/dashboard/settings/layout.tsx`. That file renders a single horizontal strip of links and does not express product-module structure or route metadata such as access rules, feature gates, or grouping. The authenticated dashboard shell in `app/dashboard/layout.tsx` already provides the overarching application navigation, the dashboard sidebar, and the user menu, so the settings redesign should slot into that existing shell instead of replacing it.

The current repository already contains the relevant settings screens for account, connections, cost guard, email, schedule, templates, team, subscription, cash plan, and import/export. SpendLeak has a dedicated dashboard page at `app/dashboard/spendleak/page.tsx`, but no settings screen under the Settings area yet. CostGuard also exposes a settings screen, but not a full multi-page settings tree like the proposed module layout implies.

## Goals / Non-Goals

**Goals:**
- Organise settings by product module while preserving the existing route structure and page components
- Keep the current application shell and header intact on desktop and mobile
- Make the active setting obvious, semantic, and resilient across reloads and browser history
- Model the settings navigation in a data-driven structure so labels, routes, permissions, and grouping stay consistent

**Non-Goals:**
- Changing business rules, persisted settings shapes, or API contracts
- Creating new placeholder settings pages for modules that do not already have a real implementation
- Redesigning the main dashboard navigation or user menu
- Replacing forms or validation behaviour on the settings screens themselves

## Decisions

### 1. Use a configuration-driven settings nav object rather than repeating link arrays in each page
The settings navigation should be represented by a single configuration object that includes module identifier, label, route, visibility rules, and match logic. That data should be used by the settings layout to render the grouped navigation list and to determine the active item.

**Why:** This is the repository’s most direct path to consistent behaviour, fewer repeated hard-coded link lists, and simpler enforcement of feature-gating and route matching. It matches the project’s existing pattern of data-first route configuration and avoids introducing a parallel navigation framework.

**Alternatives considered:** Keeping the current ad hoc `TABS` array or duplicating group logic across multiple pages would increase drift risk and make entitlement handling harder to maintain.

### 2. Preserve the current route URLs as the canonical source of truth
The redesign should not rename or move existing routes such as `/dashboard/settings/account`, `/dashboard/settings/connections`, `/dashboard/settings/cash-plan`, or `/dashboard/settings/cost-guard`. When a route already redirects to a canonical page, that redirect should remain in place.

**Why:** The repo already contains compatibility redirects for settings URLs such as `/dashboard/settings/stripe` and `/dashboard/settings/integrations` to `/dashboard/settings/connections`, and tests assert that behaviour. Retaining canonical URLs prevents broken bookmarks and keeps the change focused on architecture rather than backend transitions.

**Alternatives considered:** Rewriting URLs or moving settings pages would create a migration burden and would violate the “do not remove existing routes without documenting compatibility” requirement.

### 3. Use a three-part desktop composition: app nav, settings nav, content panel
The desktop layout should preserve the current left app rail plus the global header and add a dedicated settings navigation column between the main nav and the content panel. The content area continues to render the page component for the selected setting.

**Why:** This matches the reference composition in the attached screenshot and follows the existing app shell while making the settings area clearly distinct from the primary dashboard navigation.

**Alternatives considered:** Embedding the settings nav inline with the content would be visually crowded and would not satisfy the module-grouping required by the redesign.

### 4. Adopt an accessible drawer or grouped selector on smaller screens
For tablet and mobile, the settings navigation should collapse into a drawer, grouped selector, or similar control that stays keyboard-accessible and does not require horizontal overflow. The selected module and active setting should remain visible when the drawer is closed.

**Why:** The app already has a responsive dashboard shell; the settings navigation should follow the same pattern without introducing a novel control model. A drawer or grouped selector keeps labels visible and supports touch interaction without sacrificing accessibility.

**Alternatives considered:** A plain horizontal tab row would be too cramped at smaller breakpoints and would not allow a clear group hierarchy.

### 5. Module group visibility should be driven by existing capabilities and entitlement checks
Navigation entries should include route metadata for permission and feature gating, but the actual gating logic should continue to live in the same repository patterns (`hasPlanFeature`, `normalizeSubscriptionTier`, `canAccessSpendLeak`, and module-specific checks).

**Why:** The codebase already centralises these rules and tests around them. Reusing the existing checks avoids duplicate policy logic and keeps the settings redesign consistent with existing product entitlement rules.

**Alternatives considered:** Replacing current access checks with a parallel settings-only permission model would create drift and likely break the app’s existing subscription and module behaviour.

## Risks / Trade-offs

- [Navigation information architecture vs. route churn] → Preserve existing routes and only reorganise how the settings nav is rendered. Do not rename or duplicate routes in this change.
- [Module grouping vs. unimplemented settings pages] → Only include settings pages that already exist in the repo. For missing modules, document the mapping and leave the underlying route as a future design item rather than creating placeholder UI.
- [Responsive behaviour vs. native simplicity] → Prefer a drawer or grouped selector pattern that fits the dashboard shell instead of a custom complex pattern with brittle keyboard behaviour.
- [Accessibility vs. visual density] → Keep focus states visible, ensure `aria-current="page"`, and use both colour and text/structure to show active state rather than relying on colour alone.

## Migration Plan

1. Define the grouped settings data structure and map existing routes to module groups.
2. Update the settings layout rendering to use the grouped configuration and keep the active route matching based on the current pathname.
3. Preserve existing route aliases and redirects that the app already depends on, especially for connections.
4. Validate the page loads and active states across a representative set of routes, including a refresh and browser history flow.
5. Run the repo’s OpenSpec validation plus the relevant test suite for settings and navigation before finalising the change.

## Open Questions

No blocking design questions remain. The only unresolved area is how future module-specific settings pages for SpendLeak or invoice settings should be introduced if product ownership decides to add them later; the current change explicitly avoids inventing placeholder routes and leaves that work for a dedicated follow-up.
