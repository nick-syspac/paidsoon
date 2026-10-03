## Why

The current settings experience is a flat tab strip in `app/dashboard/settings/layout.tsx`, and it does not reflect how PaidSoon’s product modules are actually organised. Users can navigate to CashPlan, Cost Guard, and SpendLeak elsewhere in the dashboard, but the settings area still mixes module-specific controls into one linear list, making it harder to discover settings by product area and less consistent with the rest of the app’s information architecture.

This redesign makes the settings area match the real product structure: General, PaidSoon, SpendLeak, CostGuard, and CashPlan. It preserves the existing routes and forms while improving discoverability, active-state clarity, and mobile usability without changing the underlying business logic.

## What Changes

- **MODIFIED** dashboard settings navigation to group settings by product module rather than a single flat tab list
- **NEW** configuration-driven settings navigation model that defines module labels, route links, entitlement checks, and active-route behaviour in one place
- **MODIFIED** settings layout to keep the existing dashboard sidebar, settings rail, and main content panel separated on desktop while using an accessible responsive pattern on tablet/mobile
- **PRESERVED** all current settings page routes and underlying forms; legacy routes remain valid and redirect only where the app already does so
- **DOCUMENTED** module-to-setting mappings where the current repository does not yet contain a dedicated page or route so the redesign does not invent placeholder settings

## Capabilities

### New Capabilities

- `settings-module-navigation`: A module-based settings layout that groups settings by product area, preserves deep links, respects existing access rules, and maintains accessible active states across desktop and responsive navigation patterns

### Modified Capabilities

- Empty

## Impact

- **UI**: `app/dashboard/settings/layout.tsx` and the settings routes under `app/dashboard/settings/**` will be reorganised into a module-driven layout while preserving the current page components and form behaviour
- **Navigation**: The authenticated dashboard shell in `app/dashboard/layout.tsx` stays unchanged, while the settings area adds a dedicated navigation column and mobile navigation pattern
- **Access rules**: Module visibility and route accessibility must continue to respect the current subscription and feature checks already implemented in `lib/subscriptionPlans.ts`, `lib/dashboard/spendleakAccess.ts`, and module-specific pages
- **Data**: No schema, API contract, or persistence changes are proposed; the redesign only re-groups and re-routes the navigation layer
- **Testing**: Existing route and settings page tests should be extended to cover navigation config, active-state selection, keyboard navigation, and mobile responsiveness without altering the underlying settings forms

## Current-state findings and route mapping

| Existing setting or route | New group | New label | Proposed route | Migration required |
|---|---|---|---|---|
| `/dashboard/settings/account` | General | Account | `/dashboard/settings/account` | No |
| `/dashboard/settings/connections` | General | Connections | `/dashboard/settings/connections` | No |
| `/dashboard/settings/team` | General | Team | `/dashboard/settings/team` | No |
| `/dashboard/settings/subscription` | General | Subscription | `/dashboard/settings/subscription` | No |
| `/dashboard/settings/schedule` | PaidSoon | Schedule | `/dashboard/settings/schedule` | No |
| `/dashboard/settings/email` | PaidSoon | Email | `/dashboard/settings/email` | No |
| `/dashboard/settings/templates` | PaidSoon | Templates | `/dashboard/settings/templates` | No |
| `/dashboard/settings/import-export` | PaidSoon | Import / Export | `/dashboard/settings/import-export` | No |
| `/dashboard/settings/cost-guard` | CostGuard | Cost Guard | `/dashboard/settings/cost-guard` | No |
| `/dashboard/settings/cash-plan` | CashPlan | Forecast settings | `/dashboard/settings/cash-plan` | No |
| `/dashboard/spendleak` | SpendLeak | Detection rules / Categories / Alerts | no direct settings route in repo today | Recommended as a future module settings surface; do not invent placeholder routes in this change |
| No dedicated invoice-settings route exists today | PaidSoon | Invoice settings | no current route in repo | Keep as a future opportunity; the current implementation already distributes invoice-related controls across schedule/email/template/import-export contexts |
| `/dashboard/settings/stripe` and `/dashboard/settings/integrations` | General | Connections | redirect to `/dashboard/settings/connections` | Already handled by current redirect logic; preserve this compatibility |

## Scope note

This change is intentionally limited to information architecture, layout, and navigation semantics. It does not redesign the main dashboard shell, business rules, or form logic, and it does not create placeholder settings pages that imply functionality not already present in the app.
